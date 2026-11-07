import {
  readAgreementFromMessages,
  validateEvidence,
  type AgreementEvidence,
} from "@/lib/agreement";
import { getJob, listJobMessages, pool } from "@/lib/db";
import { serializeJob } from "@/lib/job";
import { amountsAddUp } from "@/lib/money";

async function saveRevision(
  jobId: string,
  version: number,
  draft: {
    workSummary: string | null;
    clientAmount: string | null;
    mayaAmount: string | null;
    studioAmount: string | null;
    evidence: AgreementEvidence;
    questions: string[];
  },
): Promise<void> {
  await pool.query(
    `insert into agreement_revisions (
       job_id, version, work_summary, client_amount, maya_amount, studio_amount, evidence, clarification_questions
     ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
     on conflict (job_id, version) do update set
       work_summary = excluded.work_summary,
       client_amount = excluded.client_amount,
       maya_amount = excluded.maya_amount,
       studio_amount = excluded.studio_amount,
       evidence = excluded.evidence,
       clarification_questions = excluded.clarification_questions`,
    [
      jobId,
      version,
      draft.workSummary,
      draft.clientAmount,
      draft.mayaAmount,
      draft.studioAmount,
      JSON.stringify(draft.evidence),
      JSON.stringify(draft.questions),
    ],
  );
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }
  if (job.paypal_order_id) {
    return Response.json(
      { error: "agreement cannot change after a PayPal order exists; create a new job" },
      { status: 409 },
    );
  }

  const messages = await listJobMessages(id);
  const outcome = readAgreementFromMessages(messages);

  const validationError = validateEvidence(
    outcome.evidence,
    messages,
    id,
    outcome.status === "ready"
      ? {
          clientAmount: outcome.clientAmount,
          mayaAmount: outcome.mayaAmount,
          studioAmount: outcome.studioAmount,
        }
      : undefined,
  );
  if (validationError) {
    return Response.json({ error: validationError }, { status: 422 });
  }

  const nextVersion = Number(job.agreement_version ?? 0) + 1;

  if (outcome.status === "needs_clarification") {
    await saveRevision(id, nextVersion, {
      workSummary: outcome.workSummary,
      clientAmount: outcome.clientAmount,
      mayaAmount: outcome.mayaAmount,
      studioAmount: outcome.studioAmount,
      evidence: outcome.evidence,
      questions: outcome.questions,
    });
    const saved = await pool.query(
      `update jobs
       set agreement_version = $2,
           agreement_status = 'needs_clarification',
           agreement_evidence = $3::jsonb,
           client_agreed_at = null,
           maya_agreed_at = null
       where id = $1
       returning *`,
      [id, nextVersion, JSON.stringify(outcome.evidence)],
    );
    return Response.json({
      job: serializeJob(saved.rows[0]),
      draft: outcome,
    });
  }

  if (!amountsAddUp(outcome.clientAmount, outcome.mayaAmount, outcome.studioAmount)) {
    return Response.json(
      {
        error:
          "draft rejected: client, Maya, and studio amounts must each be greater than zero, and the client amount must equal Maya plus studio",
        draft: outcome,
      },
      { status: 422 },
    );
  }

  await saveRevision(id, nextVersion, {
    workSummary: outcome.workSummary,
    clientAmount: outcome.clientAmount,
    mayaAmount: outcome.mayaAmount,
    studioAmount: outcome.studioAmount,
    evidence: outcome.evidence,
    questions: [],
  });

  const saved = await pool.query(
    `update jobs
     set work_summary = $2,
         client_amount = $3,
         maya_amount = $4,
         studio_amount = $5,
         agreement_version = $6,
         agreement_status = 'ready',
         agreement_evidence = $7::jsonb,
         client_agreed_at = null,
         maya_agreed_at = null
     where id = $1
     returning *`,
    [
      id,
      outcome.workSummary,
      outcome.clientAmount,
      outcome.mayaAmount,
      outcome.studioAmount,
      nextVersion,
      JSON.stringify(outcome.evidence),
    ],
  );

  return Response.json({ job: serializeJob(saved.rows[0]), draft: outcome });
}
