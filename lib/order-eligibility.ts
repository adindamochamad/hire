import type { JobRow } from "./db";
import { moneyAddsUp } from "./db";

export function orderEligibility(
  job: JobRow,
): { ok: true } | { ok: false; error: string } {
  if (job.agreement_status === "needs_clarification") {
    return { ok: false, error: "ambiguous agreement cannot create an order" };
  }
  if (job.agreement_status !== "ready" || Number(job.agreement_version ?? 0) < 1) {
    return { ok: false, error: "agreement is not ready" };
  }
  if (!moneyAddsUp(job)) {
    return { ok: false, error: "stored amounts do not add up" };
  }
  if (!job.client_agreed_at || !job.maya_agreed_at) {
    return { ok: false, error: "both parties must agree first" };
  }
  return { ok: true };
}
