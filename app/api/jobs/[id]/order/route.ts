import { getJob, pool } from "@/lib/db";
import { orderEligibility } from "@/lib/order-eligibility";
import { asString, createClientOrder } from "@/lib/paypal";

export type CreateClientOrderFn = typeof createClientOrder;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
  options?: { createClientOrder?: CreateClientOrderFn },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }
  const eligible = orderEligibility(job);
  if (!eligible.ok) {
    const status = eligible.error.includes("add up") ? 422 : 409;
    return Response.json({ error: eligible.error }, { status });
  }

  void request;
  const createOrder = options?.createClientOrder ?? createClientOrder;
  const created = await createOrder(job.id, job.client_amount, job.work_summary);
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
