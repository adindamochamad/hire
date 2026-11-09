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
  client_amount: string | null;
  maya_amount: string | null;
  studio_amount: string | null;
  client_agreed_at: Date | null;
  maya_agreed_at: Date | null;
  paypal_order_id: string | null;
  paypal_capture_id: string | null;
  paypal_payout_batch_id: string | null;
  paypal_payout_item_id: string | null;
  agreement_version: number;
  agreement_status: string | null;
  agreement_evidence: unknown;
  draft_source: string | null;
  created_at: Date;
};

export type AiRunRow = {
  model: string;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  validation: "pass" | "citation_rejected" | "parser_fallback";
  created_at: Date;
};

export type JobMessageRow = {
  id: string;
  job_id: string;
  party: "studio" | "maya" | "client";
  author_name: string;
  body: string;
  created_at: Date;
};

export async function listJobMessages(jobId: string): Promise<JobMessageRow[]> {
  const result = await pool.query<JobMessageRow>(
    `select id, job_id, party, author_name, body, created_at
     from job_messages
     where job_id = $1
     order by created_at`,
    [jobId],
  );
  return result.rows;
}

export async function insertJobMessage(
  jobId: string,
  party: "studio" | "maya" | "client",
  authorName: string,
  body: string,
  id?: string,
): Promise<JobMessageRow> {
  const messageId = id ?? `msg-${crypto.randomUUID()}`;
  const saved = await pool.query<JobMessageRow>(
    `insert into job_messages (id, job_id, party, author_name, body)
     values ($1, $2, $3, $4, $5)
     returning *`,
    [messageId, jobId, party, authorName, body],
  );
  return saved.rows[0];
}

export async function latestAiRun(jobId: string): Promise<AiRunRow | null> {
  const result = await pool.query<AiRunRow>(
    `select model, latency_ms, input_tokens, output_tokens, validation, created_at
     from ai_runs
     where job_id = $1
     order by created_at desc
     limit 1`,
    [jobId],
  );
  return result.rows[0] ?? null;
}

export async function insertAiRun(input: {
  jobId: string;
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  validation: AiRunRow["validation"];
}): Promise<void> {
  await pool.query(
    `insert into ai_runs (id, job_id, model, latency_ms, input_tokens, output_tokens, validation)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      `run-${crypto.randomUUID()}`,
      input.jobId,
      input.model,
      input.latencyMs,
      input.inputTokens,
      input.outputTokens,
      input.validation,
    ],
  );
}

export async function getJob(id: string): Promise<JobRow | null> {
  const result = await pool.query<JobRow>("select * from jobs where id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function insertJob(): Promise<JobRow> {
  const id = `hire-${crypto.randomUUID()}`;
  const saved = await pool.query<JobRow>(
    `insert into jobs (id, work_summary, client_amount, maya_amount, studio_amount)
     values ($1, null, null, null, null)
     returning *`,
    [id],
  );
  return saved.rows[0];
}

export function moneyAddsUp(job: JobRow): boolean {
  return amountsAddUp(job.client_amount, job.maya_amount, job.studio_amount);
}
