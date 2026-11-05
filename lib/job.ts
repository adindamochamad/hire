import type { JobRow } from "./db";
import { amountsAddUp } from "./money";

export type JobPayload = {
  id: string;
  work_summary: string | null;
  client_amount: string;
  maya_amount: string;
  studio_amount: string;
  client_agreed_at: string | null;
  maya_agreed_at: string | null;
  paypal_order_id: string | null;
  paypal_capture_id: string | null;
  paypal_payout_batch_id: string | null;
  paypal_payout_item_id: string | null;
  created_at: string;
};

export type PaypalEventPayload = {
  id: string;
  event_type: string;
  resource_id: string | null;
  received_at: string;
};

export type JobStatus =
  | "drafting"
  | "awaiting_agreement"
  | "awaiting_payment"
  | "paying_maya"
  | "complete";

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function serializeJob(job: JobRow): JobPayload {
  return {
    id: job.id,
    work_summary: job.work_summary,
    client_amount: job.client_amount,
    maya_amount: job.maya_amount,
    studio_amount: job.studio_amount,
    client_agreed_at: iso(job.client_agreed_at),
    maya_agreed_at: iso(job.maya_agreed_at),
    paypal_order_id: job.paypal_order_id,
    paypal_capture_id: job.paypal_capture_id,
    paypal_payout_batch_id: job.paypal_payout_batch_id,
    paypal_payout_item_id: job.paypal_payout_item_id,
    created_at: iso(job.created_at) ?? new Date().toISOString(),
  };
}

export function serializeEvent(row: {
  id: string;
  event_type: string;
  resource_id: string | null;
  received_at: Date | string;
}): PaypalEventPayload {
  return {
    id: row.id,
    event_type: row.event_type,
    resource_id: row.resource_id,
    received_at: iso(row.received_at) ?? new Date().toISOString(),
  };
}

export function hasCaptureEvent(events: PaypalEventPayload[]): boolean {
  return events.some((event) => event.event_type === "PAYMENT.CAPTURE.COMPLETED");
}

export function hasPayoutEvent(events: PaypalEventPayload[]): boolean {
  return events.some((event) => event.event_type === "PAYMENT.PAYOUTS-ITEM.SUCCEEDED");
}

export function jobStatus(job: JobPayload, events: PaypalEventPayload[]): JobStatus {
  const payoutConfirmed = hasPayoutEvent(events) && Boolean(job.paypal_payout_item_id);
  if (payoutConfirmed) return "complete";
  if (hasCaptureEvent(events)) return "paying_maya";
  const amountsOk = amountsAddUp(job.client_amount, job.maya_amount, job.studio_amount);
  if (job.client_agreed_at && job.maya_agreed_at && amountsOk) return "awaiting_payment";
  if (job.work_summary && amountsOk) return "awaiting_agreement";
  return "drafting";
}

export function statusLabel(status: JobStatus): string {
  switch (status) {
    case "drafting":
      return "Drafting";
    case "awaiting_agreement":
      return "Awaiting agreement";
    case "awaiting_payment":
      return "Awaiting client payment";
    case "paying_maya":
      return "Paying Maya";
    case "complete":
      return "Complete";
  }
}

export function agreementLocked(job: JobPayload): boolean {
  return Boolean(job.client_agreed_at || job.maya_agreed_at || job.paypal_order_id);
}
