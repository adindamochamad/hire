import { getJob, moneyAddsUp, pool } from "@/lib/db";
import { asString, createClientOrder } from "@/lib/paypal";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }
  if (!moneyAddsUp(job)) {
    return Response.json({ error: "stored amounts do not add up" }, { status: 422 });
  }
  if (!job.client_agreed_at || !job.maya_agreed_at) {
    return Response.json({ error: "both parties must agree first" }, { status: 409 });
  }

  const created = await createClientOrder(job.id, job.client_amount, job.work_summary);
  if (!created.ok) {
    return Response.json(
      { error: "create order failed", debugId: created.debugId, body: created.json },
      { status: 502 },
    );
  }

  const orderId = asString(created.json.id);
  const links = Array.isArray(created.json.links) ? created.json.links : [];
  const approve = links.find((link) => {
    const rel = asRecordRel(link);
    return rel === "payer-action" || rel === "approve";
  });

  await pool.query(`update jobs set paypal_order_id = $2 where id = $1`, [job.id, orderId]);
  return Response.json({
    orderId,
    status: created.json.status,
    approveUrl: asString(asRecord(approve)?.href),
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asRecordRel(value: unknown): string | null {
  return asString(asRecord(value)?.rel);
}
