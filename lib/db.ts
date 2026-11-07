import { Pool } from "pg";
import { amountsAddUp } from "./money";

const globalForDb = globalThis as typeof globalThis & { hirePool?: Pool };

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL missing");
  }
  const local = url.includes("localhost") || url.includes("127.0.0.1");
  return new Pool({
    connectionString: url,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
}

export function getPool(): Pool {
  if (!globalForDb.hirePool) {
    globalForDb.hirePool = createPool();
  }
  return globalForDb.hirePool;
}

export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const real = getPool();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});

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

export async function insertJob(): Promise<JobRow> {
  const id = `hire-${crypto.randomUUID()}`;
  const saved = await pool.query<JobRow>(
    `insert into jobs (id, work_summary, client_amount, maya_amount, studio_amount)
     values ($1, null, 1200.00, 800.00, 400.00)
     returning *`,
    [id],
  );
  return saved.rows[0];
}

export function moneyAddsUp(job: JobRow): boolean {
  return amountsAddUp(job.client_amount, job.maya_amount, job.studio_amount);
}
