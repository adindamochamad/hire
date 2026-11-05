import { Pool } from "pg";
import { amountsAddUp } from "./money";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL missing");
}

const globalForDb = globalThis as typeof globalThis & { hirePool?: Pool };

const local = url.includes("localhost") || url.includes("127.0.0.1");

export const pool =
  globalForDb.hirePool ??
  new Pool({
    connectionString: url,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.hirePool = pool;
}

export type JobRow = {
  id: string;
  work_summary: string | null;
  client_amount: string;
  maya_amount: string;
  studio_amount: string;
  client_agreed_at: Date | null;
  maya_agreed_at: Date | null;
  paypal_order_id: string | null;
  paypal_capture_id: string | null;
  paypal_payout_batch_id: string | null;
  paypal_payout_item_id: string | null;
  created_at: Date;
};

export async function getJob(id: string): Promise<JobRow | null> {
  const result = await pool.query<JobRow>("select * from jobs where id = $1", [id]);
  return result.rows[0] ?? null;
}

export function moneyAddsUp(job: JobRow): boolean {
  return amountsAddUp(job.client_amount, job.maya_amount, job.studio_amount);
}
