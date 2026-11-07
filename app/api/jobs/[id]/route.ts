import { getJob, pool } from "@/lib/db";
import {
  agreementLocked,
  serializeEvent,
  serializeJob,
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
  return Response.json({
    job: serializeJob(job),
    events: events.rows.map(serializeEvent) satisfies PaypalEventPayload[],
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
  if (agreementLocked(serializeJob(job))) {
    return Response.json(
      { error: "agreement is locked after a party agrees" },
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

  const saved = await pool.query(
    `update jobs
     set work_summary = $2,
         client_amount = $3,
         maya_amount = $4,
         studio_amount = $5
     where id = $1
     returning *`,
    [id, workSummary, clientAmount, mayaAmount, studioAmount],
  );
  return Response.json({ job: serializeJob(saved.rows[0]) });
}
