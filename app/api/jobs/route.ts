import { insertJob } from "@/lib/db";
import { serializeJob } from "@/lib/job";

export async function POST() {
  const job = await insertJob();
  return Response.json({ job: serializeJob(job) }, { status: 201 });
}
