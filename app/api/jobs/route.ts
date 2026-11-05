import { pool } from "@/lib/db";
import { serializeJob } from "@/lib/job";

export async function POST() {
  const id = `hire-${crypto.randomUUID()}`;
  const saved = await pool.query(
    `insert into jobs (id, work_summary, client_amount, maya_amount, studio_amount)
     values ($1, null, 1200.00, 800.00, 400.00)
     returning *`,
    [id],
  );
  const job = saved.rows[0];
  return Response.json({ job: serializeJob(job) }, { status: 201 });
}
