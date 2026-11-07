import { redirect } from "next/navigation";
import { insertJob } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function Home() {
  const job = await insertJob();
  redirect(`/jobs/${job.id}`);
}
