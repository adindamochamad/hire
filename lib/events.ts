import { getJob, moneyAddsUp, pool, type JobRow } from "./db";
import { asMoney } from "./money";
import { asRecord, asString, payoutMaya } from "./paypal";

type PaypalEvent = {
  id?: unknown;
  event_type?: unknown;
  resource?: unknown;
};

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

async function findJobForCapture(resource: Record<string, unknown> | null): Promise<JobRow | null> {
  const orderId = captureOrderId(resource);
  if (!orderId) return null;
  const result = await pool.query<JobRow>(
    "select * from jobs where paypal_order_id = $1 limit 1",
    [orderId],
  );
  return result.rows[0] ?? null;
}

async function findJobForPayout(resource: Record<string, unknown> | null): Promise<JobRow | null> {
  const senderItemId = payoutSenderItemId(resource);
  const jobId = senderItemId?.endsWith("-maya") ? senderItemId.slice(0, -"-maya".length) : null;
  const itemId = payoutItemId(resource);
  const batchId = payoutBatchId(resource);
  const result = await pool.query<JobRow>(
    `select * from jobs
     where id = $1
        or paypal_payout_item_id = $2
        or paypal_payout_batch_id = $3
     limit 1`,
    [jobId, itemId, batchId],
  );
  return result.rows[0] ?? null;
}

export async function storeVerifiedEvent(rawBody: string): Promise<{
  eventId: string;
  eventType: string;
  jobId: string | null;
}> {
  const event = JSON.parse(rawBody) as PaypalEvent;
  const eventId = asString(event.id);
  const eventType = asString(event.event_type);
  if (!eventId || !eventType) {
    throw new Error("webhook event missing id or type");
  }

  const resource = asRecord(event.resource);
  const inserted = await pool.query<{ id: string }>(
    `insert into paypal_events (id, event_type, resource_id, job_id, payload)
     values ($1, $2, $3, $4, $5::jsonb)
     on conflict (id) do nothing
     returning id`,
    [
      eventId,
      eventType,
      captureId(resource) ?? payoutItemId(resource),
      null,
      rawBody,
    ],
  );
  if (inserted.rowCount === 0) {
    const existing = await pool.query<{ job_id: string | null }>(
      "select job_id from paypal_events where id = $1",
      [eventId],
    );
    return { eventId, eventType, jobId: existing.rows[0]?.job_id ?? null };
  }

  let jobId: string | null = null;
  if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
    const job = await findJobForCapture(resource);
    if (job && (await onCaptureCompleted(job, resource))) {
      jobId = job.id;
    }
  }
  if (eventType === "PAYMENT.PAYOUTS-ITEM.SUCCEEDED") {
    const job = await findJobForPayout(resource);
    if (job && (await onPayoutSucceeded(job, resource))) {
      jobId = job.id;
    }
  }
  if (jobId) {
    await pool.query("update paypal_events set job_id = $2 where id = $1 and job_id is null", [
      eventId,
      jobId,
    ]);
  }

  return { eventId, eventType, jobId };
}

async function onCaptureCompleted(
  job: JobRow,
  resource: Record<string, unknown> | null,
): Promise<boolean> {
  if (!moneyAddsUp(job)) return false;
  const capturedAmount = resourceAmount(resource, [
    ["amount"],
    ["seller_receivable_breakdown", "gross_amount"],
  ]);
  if (capturedAmount.value !== asMoney(job.client_amount) || capturedAmount.currency !== "USD") {
    return false;
  }
  const id = captureId(resource);
  const orderId = captureOrderId(resource);
  if (!id || !orderId || orderId !== job.paypal_order_id) return false;
  await pool.query(
    `update jobs
     set paypal_capture_id = coalesce(paypal_capture_id, $2)
     where id = $1
       and paypal_order_id = $3
       and paypal_capture_id is null`,
    [job.id, id, orderId],
  );

  const fresh = await getJob(job.id);
  if (!fresh?.paypal_capture_id) return false;
  if (fresh.paypal_payout_batch_id || fresh.paypal_payout_item_id) return true;

  const email = process.env.PAYPAL_MAYA_EMAIL;
  if (!email) throw new Error("PAYPAL_MAYA_EMAIL missing");
  const paid = await payoutMaya(fresh.id, fresh.maya_amount, fresh.client_amount, email);
  if (!paid.ok) {
    throw new Error(`payout failed ${paid.status} ${paid.debugId} ${paid.raw}`);
  }
  const batch = asRecord(paid.json.batch_header);
  await pool.query(
    `update jobs set paypal_payout_batch_id = $2 where id = $1 and paypal_payout_batch_id is null`,
    [fresh.id, asString(batch?.payout_batch_id)],
  );
  return true;
}

async function onPayoutSucceeded(
  job: JobRow,
  resource: Record<string, unknown> | null,
): Promise<boolean> {
  if (!job.paypal_capture_id) return false;
  const paid = resourceAmount(resource, [["payout_item", "amount"], ["amount"]]);
  if (paid.value !== asMoney(job.maya_amount) || paid.currency !== "USD") return false;
  const itemId = payoutItemId(resource);
  if (!itemId) return false;
  await pool.query(
    `update jobs
     set paypal_payout_item_id = coalesce(paypal_payout_item_id, $2),
         paypal_payout_batch_id = coalesce(paypal_payout_batch_id, $3)
     where id = $1`,
    [job.id, itemId, payoutBatchId(resource)],
  );
  return true;
}
