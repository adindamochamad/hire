import { getJob, pool } from "@/lib/db";
import { debugLog } from "@/lib/debug-log";
import { serializeJob } from "@/lib/job";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }
  const body = (await request.json()) as { party?: string };
  if (body.party !== "client" && body.party !== "maya") {
    return Response.json({ error: "party must be client or maya" }, { status: 400 });
  }
  const column = body.party === "client" ? "client_agreed_at" : "maya_agreed_at";
  // #region agent log
  debugLog(
    "app/api/jobs/[id]/agree/route.ts",
    "agree without auth",
    {
      jobId: id,
      party: body.party,
      alreadyClient: Boolean(job.client_agreed_at),
      alreadyMaya: Boolean(job.maya_agreed_at),
      hasAuthHeader: request.headers.has("authorization"),
    },
    "C",
  );
  // #endregion
  const saved = await pool.query(
    `update jobs set ${column} = coalesce(${column}, now()) where id = $1 returning *`,
    [id],
  );
  return Response.json({ job: serializeJob(saved.rows[0]) });
}
