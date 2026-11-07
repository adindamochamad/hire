import type { AgreementEvidence } from "@/lib/agreement";
import { getJob, listJobMessages, pool } from "@/lib/db";
import {
  agreementEditable,
  serializeEvent,
  serializeJob,
  serializeMessage,
  type PaypalEventPayload,
} from "@/lib/job";
import { amountsAddUp, asMoney } from "@/lib/money";
import { asString } from "@/lib/paypal";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }
  const events = await pool.query<{
    id: string;
    event_type: string;
    resource_id: string | null;
    received_at: Date;
  }>(
    `select id, event_type, resource_id, received_at
     from paypal_events
     where job_id = $1
     order by received_at`,
    [id],
  );
  const messages = await listJobMessages(id);
  let clarificationQuestions: string[] = [];
  if (job.agreement_status === "needs_clarification" && Number(job.agreement_version) > 0) {
    const revision = await pool.query<{ clarification_questions: unknown }>(
      `select clarification_questions from agreement_revisions where job_id = $1 and version = $2`,
      [id, job.agreement_version],
    );
    const raw = revision.rows[0]?.clarification_questions;
    if (Array.isArray(raw)) {
      clarificationQuestions = raw.filter((item): item is string => typeof item === "string");
    }
  }
  return Response.json({
    job: serializeJob(job),
    events: events.rows.map(serializeEvent) satisfies PaypalEventPayload[],
    messages: messages.map(serializeMessage),
    clarificationQuestions,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }
  if (!agreementEditable(serializeJob(job))) {
    return Response.json(
      { error: "agreement cannot change after a PayPal order exists; create a new job" },
      { status: 409 },
    );
  }

  const body = (await request.json()) as Record<string, unknown>;
  const workSummary = asString(body.workSummary)?.trim();
  const clientAmount = asMoney(body.clientAmount);
  const mayaAmount = asMoney(body.mayaAmount);
  const studioAmount = asMoney(body.studioAmount);
  if (!workSummary || !clientAmount || !mayaAmount || !studioAmount) {
    return Response.json({ error: "agreement fields are incomplete" }, { status: 400 });
  }
  if (!amountsAddUp(clientAmount, mayaAmount, studioAmount)) {
    return Response.json(
      {
        error:
          "draft rejected: client, Maya, and studio amounts must each be greater than zero, and the client amount must equal Maya plus studio",
      },
      { status: 422 },
    );
  }

  const currentEvidence =
    job.agreement_evidence && typeof job.agreement_evidence === "object"
      ? ({ ...(job.agreement_evidence as AgreementEvidence) } as AgreementEvidence)
      : ({} as AgreementEvidence);

  if (workSummary !== (job.work_summary ?? "")) delete currentEvidence.workSummary;
  if (clientAmount !== job.client_amount) delete currentEvidence.clientAmount;
  if (mayaAmount !== job.maya_amount) delete currentEvidence.mayaAmount;
  if (studioAmount !== job.studio_amount) delete currentEvidence.studioAmount;

  const nextVersion = Number(job.agreement_version ?? 0) + 1;

  await pool.query(
    `insert into agreement_revisions (
       job_id, version, work_summary, client_amount, maya_amount, studio_amount, evidence, clarification_questions
     ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, '[]'::jsonb)
     on conflict (job_id, version) do nothing`,
    [
      id,
      nextVersion,
      workSummary,
      clientAmount,
      mayaAmount,
      studioAmount,
      JSON.stringify(currentEvidence),
    ],
  );

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
    [id, workSummary, clientAmount, mayaAmount, studioAmount, nextVersion, JSON.stringify(currentEvidence)],
  );
  return Response.json({ job: serializeJob(saved.rows[0]) });
}
