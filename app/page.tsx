import { redirect } from "next/navigation";
import { insertJob } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const job = await insertJob();
  redirect(`/jobs/${job.id}`);
}
