import { getJob, pool } from "@/lib/db";
import { serializeJob } from "@/lib/job";
import { amountsAddUp } from "@/lib/money";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }
  if (job.agreement_status !== "ready" || Number(job.agreement_version ?? 0) < 1) {
    return Response.json({ error: "agreement is not ready" }, { status: 409 });
  }
  if (!job.work_summary || !amountsAddUp(job.client_amount, job.maya_amount, job.studio_amount)) {
    return Response.json({ error: "agreement is not ready" }, { status: 409 });
  }

  const body = (await request.json()) as { party?: string; agreementVersion?: number };
  if (body.party !== "client" && body.party !== "maya") {
    return Response.json({ error: "party must be client or maya" }, { status: 400 });
  }

  const currentVersion = Number(job.agreement_version ?? 0);
  if (
    body.agreementVersion !== undefined &&
    Number(body.agreementVersion) !== currentVersion
  ) {
    return Response.json({ error: "agreement version is outdated; review the latest draft" }, { status: 409 });
  }
  if (currentVersion > 0 && body.agreementVersion === undefined) {
    return Response.json({ error: "agreementVersion is required" }, { status: 400 });
  }

  const column = body.party === "client" ? "client_agreed_at" : "maya_agreed_at";
  const saved = await pool.query(
    `update jobs set ${column} = coalesce(${column}, now()) where id = $1 and agreement_version = $2 returning *`,
    [id, currentVersion],
  );
  if (saved.rows.length === 0) {
    return Response.json({ error: "agreement version is outdated; review the latest draft" }, { status: 409 });
  }
  return Response.json({ job: serializeJob(saved.rows[0]) });
}
