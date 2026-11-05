import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jobId = "hire-job-1";
const resultPath = join(root, "sandbox-test-result.json");

for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  process.env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

const apiBase = process.env.PAYPAL_API_BASE;
const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
const mayaEmail = process.env.PAYPAL_MAYA_EMAIL;

if (!apiBase || !clientId || !clientSecret || !mayaEmail) {
  throw new Error("Missing PayPal env");
}

async function paypal(path, { method = "GET", body, requestId } = {}) {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(`oauth failed ${tokenRes.status} ${JSON.stringify(tokenJson)}`);
  }

  const headers = {
    Authorization: `Bearer ${tokenJson.access_token}`,
    "Content-Type": "application/json",
  };
  if (requestId) headers["PayPal-Request-Id"] = requestId;

  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  return { ok: res.ok, status: res.status, json, debugId: res.headers.get("paypal-debug-id") };
}

function save(data) {
  writeFileSync(resultPath, `${JSON.stringify(data, null, 2)}\n`);
}

function load() {
  return JSON.parse(readFileSync(resultPath, "utf8"));
}

const step = process.argv[2] ?? "create";

if (step === "create") {
  const created = await paypal("/v2/checkout/orders", {
    method: "POST",
    requestId: `${jobId}-order`,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: jobId,
          description: "Landing page, two rounds of revision",
          amount: { currency_code: "USD", value: "1200.00" },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: "https://example.com/return",
            cancel_url: "https://example.com/cancel",
          },
        },
      },
    },
  });

  if (!created.ok) {
    console.error("create order failed", created.status, created.debugId, created.json);
    process.exit(1);
  }

  const approve =
    created.json.links?.find((link) => link.rel === "payer-action" || link.rel === "approve")
      ?.href ?? null;

  save({
    jobId,
    clientAmount: "1200.00",
    mayaAmount: "800.00",
    studioAmount: "400.00",
    orderId: created.json.id,
    orderStatus: created.json.status,
    approveUrl: approve,
    captureId: null,
    payoutBatchId: null,
    payoutItemId: null,
    payoutItemStatus: null,
  });

  console.log(JSON.stringify({ orderId: created.json.id, status: created.json.status, approveUrl: approve }, null, 2));
  process.exit(0);
}

if (step === "status") {
  const state = load();
  const shown = await paypal(`/v2/checkout/orders/${state.orderId}`);
  console.log(JSON.stringify({ http: shown.status, order: shown.json.status, id: shown.json.id }, null, 2));
  process.exit(shown.ok ? 0 : 1);
}

if (step === "capture") {
  const state = load();
  const captured = await paypal(`/v2/checkout/orders/${state.orderId}/capture`, {
    method: "POST",
    requestId: `${jobId}-capture`,
  });

  if (!captured.ok) {
    console.error("capture failed", captured.status, captured.debugId, captured.json);
    process.exit(1);
  }

  const capture =
    captured.json.purchase_units?.[0]?.payments?.captures?.[0] ?? null;
  state.orderStatus = captured.json.status;
  state.captureId = capture?.id ?? null;
  state.captureStatus = capture?.status ?? null;
  save(state);

  if (state.captureStatus !== "COMPLETED" || !state.captureId) {
    console.error("capture not completed", captured.json);
    process.exit(1);
  }

  console.log(JSON.stringify({ orderId: state.orderId, captureId: state.captureId, captureStatus: state.captureStatus }, null, 2));
  process.exit(0);
}

if (step === "payout") {
  const state = load();
  if (!state.captureId) {
    console.error("no capture id; stop");
    process.exit(1);
  }

  const paid = await paypal("/v1/payments/payouts", {
    method: "POST",
    requestId: jobId,
    body: {
      sender_batch_header: {
        sender_batch_id: jobId,
        email_subject: "Maya share for the landing page",
        email_message: "Client paid $1,200. Your share is $800.",
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: { value: "800.00", currency: "USD" },
          receiver: mayaEmail,
          note: "Maya share $800 of client $1,200",
          sender_item_id: `${jobId}-maya`,
        },
      ],
    },
  });

  if (!paid.ok) {
    state.payoutError = { status: paid.status, debugId: paid.debugId, body: paid.json };
    save(state);
    console.error("payout failed", paid.status, paid.debugId, paid.json);
    process.exit(1);
  }

  state.payoutBatchId = paid.json.batch_header?.payout_batch_id ?? null;
  state.payoutBatchStatus = paid.json.batch_header?.batch_status ?? null;
  save(state);
  console.log(
    JSON.stringify(
      { payoutBatchId: state.payoutBatchId, payoutBatchStatus: state.payoutBatchStatus },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (step === "payout-status") {
  const state = load();
  const shown = await paypal(`/v1/payments/payouts/${state.payoutBatchId}`);
  const item = shown.json.items?.[0];
  state.payoutBatchStatus = shown.json.batch_header?.batch_status ?? null;
  state.payoutItemId = item?.payout_item_id ?? null;
  state.payoutItemStatus = item?.transaction_status ?? null;
  if (item?.errors) state.payoutItemError = item.errors;
  save(state);
  console.log(
    JSON.stringify(
      {
        http: shown.status,
        batch: state.payoutBatchStatus,
        payoutItemId: state.payoutItemId,
        payoutItemStatus: state.payoutItemStatus,
        error: item?.errors ?? null,
      },
      null,
      2,
    ),
  );
  process.exit(shown.ok ? 0 : 1);
}

console.error("unknown step", step);
process.exit(1);
