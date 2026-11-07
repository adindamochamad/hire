import { PayPalAPI } from "@paypal/agent-toolkit/mcp";

type PaypalJson = Record<string, unknown>;

type PaypalResult = {
  ok: boolean;
  status: number;
  json: PaypalJson;
  debugId: string | null;
  raw: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} missing`);
  return value;
}

async function accessToken(): Promise<string> {
  const apiBase = required("PAYPAL_API_BASE");
  const clientId = required("PAYPAL_CLIENT_ID");
  const clientSecret = required("PAYPAL_CLIENT_SECRET");
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = (await res.json()) as { access_token?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`oauth failed ${res.status}`);
  }
  return json.access_token;
}

export async function paypal(
  path: string,
  { method = "GET", body, requestId, rawBody }: {
    method?: string;
    body?: unknown;
    requestId?: string;
    rawBody?: string;
  } = {},
): Promise<PaypalResult> {
  const apiBase = required("PAYPAL_API_BASE");
  const token = await accessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (requestId) headers["PayPal-Request-Id"] = requestId;
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: rawBody ?? (body ? JSON.stringify(body) : undefined),
  });
  const raw = await res.text();
  const json = (raw ? JSON.parse(raw) : {}) as PaypalJson;
  return {
    ok: res.ok,
    status: res.status,
    json,
    debugId: res.headers.get("paypal-debug-id"),
    raw,
  };
}

export async function verifyWebhookSignature(
  rawBody: string,
  headers: {
    authAlgo: string | null;
    certUrl: string | null;
    transmissionId: string | null;
    transmissionSig: string | null;
    transmissionTime: string | null;
  },
): Promise<boolean> {
  const webhookId = required("PAYPAL_WEBHOOK_ID");
  const { authAlgo, certUrl, transmissionId, transmissionSig, transmissionTime } = headers;
  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return false;
  }

  const verifyBody =
    `{"auth_algo":${JSON.stringify(authAlgo)},` +
    `"cert_url":${JSON.stringify(certUrl)},` +
    `"transmission_id":${JSON.stringify(transmissionId)},` +
    `"transmission_sig":${JSON.stringify(transmissionSig)},` +
    `"transmission_time":${JSON.stringify(transmissionTime)},` +
    `"webhook_id":${JSON.stringify(webhookId)},` +
    `"webhook_event":${rawBody}}`;

  const result = await paypal("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    rawBody: verifyBody,
  });
  return result.ok && result.json.verification_status === "SUCCESS";
}

function publicOrigin(): string {
  const fromEnv = process.env.APP_ORIGIN ?? process.env.RENDER_EXTERNAL_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://127.0.0.1:3000";
}

function toolkit(requestId: string, token: string) {
  return new PayPalAPI(token, {
    sandbox: true,
    request_id: requestId,
    source: "hire",
  });
}

async function runToolkit(
  method: string,
  arg: unknown,
  requestId: string,
): Promise<PaypalResult> {
  const raw = await toolkit(requestId, await accessToken()).run(method, arg);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, status: 502, json: {}, debugId: null, raw };
  }
  const record = asRecord(parsed);
  if (!record || record.error) {
    return { ok: false, status: 502, json: record ?? {}, debugId: null, raw };
  }
  const nested = asRecord(record.response);
  const json = nested ?? record;
  return {
    ok: record.status !== "error",
    status: record.status === "error" ? 502 : 200,
    json,
    debugId: null,
    raw,
  };
}

export async function createClientOrder(jobId: string, amount: string, summary: string | null) {
  const jobUrl = `${publicOrigin()}/jobs/${jobId}`;
  const cost = Number(amount);
  return runToolkit(
    "create_order",
    {
      currencyCode: "USD",
      items: [
        {
          name: (summary ?? jobId).slice(0, 127),
          quantity: 1,
          itemCost: cost,
          itemTotal: cost,
          taxPercent: 0,
          description: `Hire job ${jobId}`,
        },
      ],
      returnUrl: jobUrl,
      cancelUrl: jobUrl,
    },
    `${jobId}-order`,
  );
}

export async function captureOrder(orderId: string, jobId: string) {
  return runToolkit("pay_order", { id: orderId }, `${jobId}-capture`);
}

export async function payoutMaya(
  jobId: string,
  mayaAmount: string,
  clientAmount: string,
  email: string,
) {
  return paypal("/v1/payments/payouts", {
    method: "POST",
    requestId: jobId,
    body: {
      sender_batch_header: {
        sender_batch_id: jobId,
        email_subject: `Maya share for ${jobId}`,
        email_message: `Client paid ${clientAmount}. Your share is ${mayaAmount}.`,
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: { value: mayaAmount, currency: "USD" },
          receiver: email,
          note: `Maya share ${mayaAmount} of client ${clientAmount}`,
          sender_item_id: `${jobId}-maya`,
        },
      ],
    },
  });
}

export function asRecord(value: unknown): PaypalJson | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as PaypalJson)
    : null;
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
