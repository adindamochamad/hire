import { notFound } from "next/navigation";
import { getJob, pool } from "@/lib/db";
import { serializeEvent, serializeJob } from "@/lib/job";
import { JobPortal } from "./job-portal";

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

  return (
    <JobPortal
      initialJob={serializeJob(job)}
      initialEvents={events.rows.map(serializeEvent)}
    />
  );
}
