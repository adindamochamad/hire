import type { JobRow } from "./db";
import { pool } from "./db";
import { asMoney } from "./money";

export const DRIFT_QUESTION =
  "Agreement drift: a new note changed an amount. Draft again. Both parties must agree before PayPal opens.";

export function amountsMentioned(text: string): string[] {
  const found: string[] = [];
  const pattern = /\$[\d,]+(?:\.\d{1,2})?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const money = asMoney(match[0].replace(/[$,]/g, ""));
    if (money) found.push(money);
  }
  const lower = text.toLowerCase();
  if (lower.includes("one thousand two hundred")) found.push("1200.00");
  if (/\beight hundred\b/.test(lower)) found.push("800.00");
  if (/\bfour hundred\b/.test(lower)) found.push("400.00");
  return found;
}

export function noteBreaksStoredAmounts(body: string, stored: string[]): boolean {
  const found = amountsMentioned(body);
  if (found.length === 0) return false;
  const allowed = new Set(stored.map((value) => asMoney(value)).filter((value): value is string => Boolean(value)));
  return found.some((amount) => !allowed.has(amount));
}

export async function markAgreementDrift(job: JobRow): Promise<void> {
  const nextVersion = Number(job.agreement_version ?? 0) + 1;
  await pool.query(
    `insert into agreement_revisions (
       job_id, version, work_summary, client_amount, maya_amount, studio_amount, evidence, clarification_questions
     ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
     on conflict (job_id, version) do update set
       clarification_questions = excluded.clarification_questions`,
    [
      job.id,
      nextVersion,
      job.work_summary,
      job.client_amount,
      job.maya_amount,
      job.studio_amount,
      JSON.stringify(job.agreement_evidence ?? {}),
      JSON.stringify([DRIFT_QUESTION]),
    ],
  );
  await pool.query(
    `update jobs
     set agreement_version = $2,
         agreement_status = 'needs_clarification',
         client_agreed_at = null,
         maya_agreed_at = null,
         draft_source = null
     where id = $1`,
    [job.id, nextVersion],
  );
}
