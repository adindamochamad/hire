import { getJob, moneyAddsUp, pool } from "@/lib/db";
import { debugLog } from "@/lib/debug-log";
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
  // #region agent log
  debugLog(
    "app/api/jobs/[id]/capture/route.ts",
    "capture result",
    {
      jobId: job.id,
      requestId: `${job.id}-capture`,
      ok: captured.ok,
      status: captured.status,
      paypalDebugId: captured.debugId,
      issue: typeof captured.json.name === "string" ? captured.json.name : null,
    },
    "B",
  );
  // #endregion
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

  await pool.query(
    `update jobs set paypal_capture_id = coalesce(paypal_capture_id, $2) where id = $1`,
    [job.id, captureId],
  );

  return Response.json({
    orderId: job.paypal_order_id,
    captureId,
    captureStatus,
  });
}
