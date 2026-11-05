import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await pool.query("select 1");
  return Response.json({ ok: true });
}
