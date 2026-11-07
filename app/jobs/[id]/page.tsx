import { notFound } from "next/navigation";
import { getJob, listJobMessages, pool } from "@/lib/db";
import { serializeEvent, serializeJob, serializeMessage } from "@/lib/job";
import { JobPortal } from "./job-portal";

export const dynamic = "force-dynamic";

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

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

  return (
    <JobPortal
      initialJob={serializeJob(job)}
      initialEvents={events.rows.map(serializeEvent)}
      initialMessages={messages.map(serializeMessage)}
      initialClarificationQuestions={clarificationQuestions}
    />
  );
}
