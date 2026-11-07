import { getJob, moneyAddsUp } from "@/lib/db";
import { asRecord, asString, captureOrder } from "@/lib/paypal";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }
  if (!moneyAddsUp(job) || !job.paypal_order_id) {
    return Response.json({ error: "order is not ready to capture" }, { status: 409 });
  }

  const captured = await captureOrder(job.paypal_order_id, job.id);
  if (!captured.ok) {
    return Response.json(
      { error: "capture failed", debugId: captured.debugId, body: captured.json },
      { status: 502 },
    );
  }

  const units = Array.isArray(captured.json.purchase_units)
    ? captured.json.purchase_units
    : [];
  const payments = asRecord(asRecord(units[0])?.payments);
  const captures = Array.isArray(payments?.captures) ? payments.captures : [];
  const capture = asRecord(captures[0]);
  const captureId = asString(capture?.id);
  const captureStatus = asString(capture?.status);

  return Response.json({
    orderId: job.paypal_order_id,
    captureId,
    captureStatus,
  });
}
