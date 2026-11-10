import type { AgreementEvidence } from "./agreement";
import type { JobRow } from "./db";
import { amountsAddUp } from "./money";

export type JobPayload = {
  id: string;
  work_summary: string | null;
  client_amount: string | null;
  maya_amount: string | null;
  studio_amount: string | null;
  client_agreed_at: string | null;
  maya_agreed_at: string | null;
  paypal_order_id: string | null;
  paypal_capture_id: string | null;
  paypal_payout_batch_id: string | null;
  paypal_payout_item_id: string | null;
  agreement_version: number;
  agreement_status: "ready" | "needs_clarification" | null;
  agreement_evidence: AgreementEvidence | null;
  draft_source: "model" | "parser" | null;
  created_at: string;
};

export type AiRunPayload = {
  model: string;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  validation: "pass" | "citation_rejected" | "parser_fallback";
  created_at: string;
};

export type JobMessagePayload = {
  id: string;
  party: "studio" | "maya" | "client";
  author_name: string;
  body: string;
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
  | "needs_clarification"
  | "awaiting_agreement"
  | "awaiting_payment"
  | "paying_maya"
  | "complete";

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function serializeJob(job: JobRow): JobPayload {
  const evidence = job.agreement_evidence;
  const parsedEvidence =
    evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? (evidence as AgreementEvidence)
      : null;
  return {
    id: job.id,
    work_summary: job.work_summary,
    client_amount: job.client_amount == null ? null : String(job.client_amount),
    maya_amount: job.maya_amount == null ? null : String(job.maya_amount),
    studio_amount: job.studio_amount == null ? null : String(job.studio_amount),
    client_agreed_at: iso(job.client_agreed_at),
    maya_agreed_at: iso(job.maya_agreed_at),
    paypal_order_id: job.paypal_order_id,
    paypal_capture_id: job.paypal_capture_id,
    paypal_payout_batch_id: job.paypal_payout_batch_id,
    paypal_payout_item_id: job.paypal_payout_item_id,
    agreement_version: Number(job.agreement_version ?? 0),
    agreement_status:
      job.agreement_status === "ready" || job.agreement_status === "needs_clarification"
        ? job.agreement_status
        : null,
    agreement_evidence: parsedEvidence,
    draft_source: job.draft_source === "model" || job.draft_source === "parser" ? job.draft_source : null,
    created_at: iso(job.created_at) ?? new Date().toISOString(),
  };
}

export function serializeAiRun(run: {
  model: string;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  validation: AiRunPayload["validation"];
  created_at: Date | string;
}): AiRunPayload {
  return {
    model: run.model,
    latency_ms: Number(run.latency_ms),
    input_tokens: run.input_tokens === null ? null : Number(run.input_tokens),
    output_tokens: run.output_tokens === null ? null : Number(run.output_tokens),
    validation: run.validation,
    created_at: iso(run.created_at) ?? new Date().toISOString(),
  };
}

export const DRIFT_QUESTION =
  "Agreement drift: a new note changed an amount. Draft again. Both parties must agree before PayPal opens.";

export function agreementDrifted(job: JobPayload, questions: string[]): boolean {
  return job.agreement_status === "needs_clarification" && questions.includes(DRIFT_QUESTION);
}

export function moneyVisible(job: JobPayload): boolean {
  return job.agreement_status === "ready" || Boolean(job.paypal_order_id);
}

export function serializeMessage(row: {
  id: string;
  party: "studio" | "maya" | "client";
  author_name: string;
  body: string;
  created_at: Date | string;
}): JobMessagePayload {
  return {
    id: row.id,
    party: row.party,
    author_name: row.author_name,
    body: row.body,
    created_at: iso(row.created_at) ?? new Date().toISOString(),
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

export function jobStatus(job: JobPayload, _events?: PaypalEventPayload[]): JobStatus {
  if (job.paypal_payout_item_id) return "complete";
  if (job.paypal_capture_id) return "paying_maya";
  if (job.agreement_status === "needs_clarification") return "needs_clarification";
  if (job.agreement_status !== "ready") return "drafting";
  const amountsOk = amountsAddUp(job.client_amount, job.maya_amount, job.studio_amount);
  if (job.client_agreed_at && job.maya_agreed_at && amountsOk) return "awaiting_payment";
  if (job.work_summary && amountsOk) return "awaiting_agreement";
  return "drafting";
}

export function statusLabel(status: JobStatus): string {
  switch (status) {
    case "drafting":
      return "Drafting";
    case "needs_clarification":
      return "Needs clarification";
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
  return Boolean(job.paypal_order_id);
}

export function agreementEditable(job: JobPayload): boolean {
  return !job.paypal_order_id;
}
