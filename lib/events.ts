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
  const job =
    eventType === "PAYMENT.CAPTURE.COMPLETED"
      ? await findJobForCapture(resource)
      : eventType === "PAYMENT.PAYOUTS-ITEM.SUCCEEDED"
        ? await findJobForPayout(resource)
        : null;

  await pool.query(
    `insert into paypal_events (id, event_type, resource_id, job_id, payload)
     values ($1, $2, $3, $4, $5::jsonb)
     on conflict (id) do nothing`,
    [
      eventId,
      eventType,
      captureId(resource) ?? payoutItemId(resource),
      job?.id ?? null,
      rawBody,
    ],
  );

  if (eventType === "PAYMENT.CAPTURE.COMPLETED" && job) {
    await onCaptureCompleted(job, resource);
  }
  if (eventType === "PAYMENT.PAYOUTS-ITEM.SUCCEEDED" && job) {
    await onPayoutSucceeded(job, resource);
  }

  return { eventId, eventType, jobId: job?.id ?? null };
}

async function onCaptureCompleted(job: JobRow, resource: Record<string, unknown> | null) {
  if (!moneyAddsUp(job)) return;
  const capturedAmount = resourceAmount(resource, [
    ["amount"],
    ["seller_receivable_breakdown", "gross_amount"],
  ]);
  if (capturedAmount.value !== asMoney(job.client_amount) || capturedAmount.currency !== "USD") return;
  const id = captureId(resource);
  const orderId = captureOrderId(resource);
  await pool.query(
    `update jobs
     set paypal_capture_id = coalesce(paypal_capture_id, $2),
         paypal_order_id = coalesce(paypal_order_id, $3)
     where id = $1`,
    [job.id, id, orderId],
  );

  const fresh = await getJob(job.id);
  if (!fresh || fresh.paypal_payout_batch_id || fresh.paypal_payout_item_id) return;

  const email = process.env.PAYPAL_MAYA_EMAIL;
  if (!email) throw new Error("PAYPAL_MAYA_EMAIL missing");
  const paid = await payoutMaya(fresh.id, fresh.maya_amount, email);
  if (!paid.ok) {
    throw new Error(`payout failed ${paid.status} ${paid.debugId} ${paid.raw}`);
  }
  const batch = asRecord(paid.json.batch_header);
  await pool.query(
    `update jobs set paypal_payout_batch_id = $2 where id = $1 and paypal_payout_batch_id is null`,
    [fresh.id, asString(batch?.payout_batch_id)],
  );
}

async function onPayoutSucceeded(job: JobRow, resource: Record<string, unknown> | null) {
  const paid = resourceAmount(resource, [["payout_item", "amount"], ["amount"]]);
  if (paid.value !== asMoney(job.maya_amount) || (paid.currency && paid.currency !== "USD")) return;
  await pool.query(
    `update jobs
     set paypal_payout_item_id = coalesce(paypal_payout_item_id, $2),
         paypal_payout_batch_id = coalesce(paypal_payout_batch_id, $3)
     where id = $1`,
    [job.id, payoutItemId(resource), payoutBatchId(resource)],
  );
}
