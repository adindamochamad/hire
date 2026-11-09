import type { PoolClient } from "pg";
import { moneyAddsUp, pool, type JobRow } from "./db";
import { asMoney } from "./money";
import { asRecord, asString, payoutMaya } from "./paypal";

type Db = Pick<PoolClient, "query">;

type PayoutMayaFn = typeof payoutMaya;

export type StoreVerifiedEventOptions = {
  payoutMaya?: PayoutMayaFn;
};

type PaypalEvent = {
  id?: unknown;
  event_type?: unknown;
  resource?: unknown;
};

type HandlerOutcome = "ok" | "rejected";

function nestedString(record: Record<string, unknown> | null, path: string[]): string | null {
  let current: unknown = record;
  for (const key of path) {
    const obj = asRecord(current);
    if (!obj) return null;
    current = obj[key];
  }
  return asString(current);
}

export function captureOrderId(resource: Record<string, unknown> | null): string | null {
  return nestedString(resource, ["supplementary_data", "related_ids", "order_id"]);
}

export function captureId(resource: Record<string, unknown> | null): string | null {
  return asString(resource?.id);
}

export function payoutItemId(resource: Record<string, unknown> | null): string | null {
  return asString(resource?.payout_item_id) ?? asString(resource?.id);
}

export function payoutSenderItemId(resource: Record<string, unknown> | null): string | null {
  return nestedString(resource, ["payout_item", "sender_item_id"]);
}

export function payoutBatchId(resource: Record<string, unknown> | null): string | null {
  return asString(resource?.payout_batch_id);
}

function resourceAmount(
  resource: Record<string, unknown> | null,
  paths: string[][],
): { value: string | null; currency: string | null } {
  for (const path of paths) {
    const value = nestedString(resource, [...path, "value"]);
    const currency =
      nestedString(resource, [...path, "currency_code"]) ??
      nestedString(resource, [...path, "currency"]);
    if (value) return { value: asMoney(value), currency };
  }
  return { value: null, currency: null };
}

async function findJobForCapture(
  resource: Record<string, unknown> | null,
  db: Db = pool,
): Promise<JobRow | null> {
  const orderId = captureOrderId(resource);
  if (!orderId) return null;
  const result = await db.query<JobRow>(
    "select * from jobs where paypal_order_id = $1 limit 1",
    [orderId],
  );
  return result.rows[0] ?? null;
}

async function findJobForPayout(
  resource: Record<string, unknown> | null,
  db: Db = pool,
): Promise<JobRow | null> {
  const senderItemId = payoutSenderItemId(resource);
  const jobId = senderItemId?.endsWith("-maya") ? senderItemId.slice(0, -"-maya".length) : null;
  const itemId = payoutItemId(resource);
  const batchId = payoutBatchId(resource);
  const result = await db.query<JobRow>(
    `select * from jobs
     where id = $1
        or paypal_payout_item_id = $2
        or paypal_payout_batch_id = $3
     limit 1`,
    [jobId, itemId, batchId],
  );
  return result.rows[0] ?? null;
}

async function getJobForUpdate(jobId: string, db: Db): Promise<JobRow | null> {
  const result = await db.query<JobRow>("select * from jobs where id = $1 for update", [jobId]);
  return result.rows[0] ?? null;
}

async function finishProcessed(
  db: Db,
  eventId: string,
  jobId: string | null,
): Promise<void> {
  await db.query(
    `update paypal_events
     set processed_at = now(),
         job_id = coalesce(job_id, $2)
     where id = $1`,
    [eventId, jobId],
  );
}

async function handleVerifiedEvent(
  db: Db,
  eventId: string,
  eventType: string,
  resource: Record<string, unknown> | null,
  payoutMayaFn: PayoutMayaFn,
): Promise<{ jobId: string | null; processed: boolean }> {
  if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
    const job = await findJobForCapture(resource, db);
    if (!job) {
      await finishProcessed(db, eventId, null);
      return { jobId: null, processed: true };
    }
    const outcome = await onCaptureCompleted(job, resource, db, payoutMayaFn);
    if (outcome === "ok") {
      await finishProcessed(db, eventId, job.id);
      return { jobId: job.id, processed: true };
    }
    await finishProcessed(db, eventId, null);
    return { jobId: null, processed: true };
  }

  if (eventType === "PAYMENT.PAYOUTS-ITEM.SUCCEEDED") {
    const job = await findJobForPayout(resource, db);
    if (!job) {
      await finishProcessed(db, eventId, null);
      return { jobId: null, processed: true };
    }
    const outcome = await onPayoutSucceeded(job, resource, db);
    if (outcome === "ok") {
      await finishProcessed(db, eventId, job.id);
      return { jobId: job.id, processed: true };
    }
    await finishProcessed(db, eventId, null);
    return { jobId: null, processed: true };
  }

  await finishProcessed(db, eventId, null);
  return { jobId: null, processed: true };
}

export async function storeVerifiedEvent(
  rawBody: string,
  options?: StoreVerifiedEventOptions,
): Promise<{
  eventId: string;
  eventType: string;
  jobId: string | null;
}> {
  const payoutMayaFn = options?.payoutMaya ?? payoutMaya;
  const event = JSON.parse(rawBody) as PaypalEvent;
  const eventId = asString(event.id);
  const eventType = asString(event.event_type);
  if (!eventId || !eventType) {
    throw new Error("webhook event missing id or type");
  }

  const resource = asRecord(event.resource);

  await pool.query(
    `insert into paypal_events (id, event_type, resource_id, job_id, payload)
     values ($1, $2, $3, $4, $5::jsonb)
     on conflict (id) do nothing`,
    [
      eventId,
      eventType,
      captureId(resource) ?? payoutItemId(resource),
      null,
      rawBody,
    ],
  );

  const client = await pool.connect();
  try {
    await client.query("begin");
    const locked = await client.query<{ job_id: string | null; processed_at: Date | null }>(
      "select job_id, processed_at from paypal_events where id = $1 for update",
      [eventId],
    );
    const row = locked.rows[0];
    if (!row) {
      throw new Error("webhook event row missing after insert");
    }
    if (row.processed_at) {
      await client.query("commit");
      return { eventId, eventType, jobId: row.job_id };
    }

    const { jobId } = await handleVerifiedEvent(
      client,
      eventId,
      eventType,
      resource,
      payoutMayaFn,
    );
    await client.query("commit");
    return { eventId, eventType, jobId };
  } catch (error) {
    // Keep validated capture (and event row) when payout or post-payout persistence fails so PayPal can retry.
    try {
      await client.query("commit");
    } catch {
      await client.query("rollback");
    }
    throw error;
  } finally {
    client.release();
  }
}

async function onCaptureCompleted(
  job: JobRow,
  resource: Record<string, unknown> | null,
  db: Db,
  payoutMayaFn: PayoutMayaFn,
): Promise<HandlerOutcome> {
  if (!moneyAddsUp(job)) return "rejected";
  const capturedAmount = resourceAmount(resource, [
    ["amount"],
    ["seller_receivable_breakdown", "gross_amount"],
  ]);
  if (capturedAmount.value !== asMoney(job.client_amount) || capturedAmount.currency !== "USD") {
    return "rejected";
  }
  const id = captureId(resource);
  const orderId = captureOrderId(resource);
  if (!id || !orderId || orderId !== job.paypal_order_id) return "rejected";

  await db.query(
    `update jobs
     set paypal_capture_id = coalesce(paypal_capture_id, $2)
     where id = $1
       and paypal_order_id = $3
       and paypal_capture_id is null`,
    [job.id, id, orderId],
  );

  const locked = await getJobForUpdate(job.id, db);
  if (!locked?.paypal_capture_id) return "rejected";
  if (locked.paypal_payout_batch_id || locked.paypal_payout_item_id) return "ok";

  await db.query("savepoint maya_payout");
  try {
    const email = process.env.PAYPAL_MAYA_EMAIL;
    if (!email) throw new Error("PAYPAL_MAYA_EMAIL missing");
    if (!locked.maya_amount || !locked.client_amount) return "rejected";
    const paid = await payoutMayaFn(locked.id, locked.maya_amount, locked.client_amount, email);
    if (!paid.ok) {
      throw new Error(`payout failed ${paid.status} ${paid.debugId} ${paid.raw}`);
    }

    const batch = asRecord(paid.json.batch_header);
    await db.query(
      `update jobs set paypal_payout_batch_id = $2 where id = $1 and paypal_payout_batch_id is null`,
      [locked.id, asString(batch?.payout_batch_id)],
    );
    await db.query("release savepoint maya_payout");
    return "ok";
  } catch (error) {
    await db.query("rollback to savepoint maya_payout");
    throw error;
  }
}

async function onPayoutSucceeded(
  job: JobRow,
  resource: Record<string, unknown> | null,
  db: Db,
): Promise<HandlerOutcome> {
  if (!job.paypal_capture_id) return "rejected";
  const paid = resourceAmount(resource, [["payout_item", "amount"], ["amount"]]);
  if (paid.value !== asMoney(job.maya_amount) || paid.currency !== "USD") {
    return "rejected";
  }
  const itemId = payoutItemId(resource);
  if (!itemId) return "rejected";
  await db.query(
    `update jobs
     set paypal_payout_item_id = coalesce(paypal_payout_item_id, $2),
         paypal_payout_batch_id = coalesce(paypal_payout_batch_id, $3)
     where id = $1`,
    [job.id, itemId, payoutBatchId(resource)],
  );
  return "ok";
}
