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

export async function createClientOrder(jobId: string, amount: string) {
  const jobUrl = `${publicOrigin()}/jobs/${jobId}`;
  return paypal("/v2/checkout/orders", {
    method: "POST",
    requestId: `${jobId}-order`,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: jobId,
          custom_id: jobId,
          description: "Landing page, two rounds of revision",
          amount: { currency_code: "USD", value: amount },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: jobUrl,
            cancel_url: jobUrl,
          },
        },
      },
    },
  });
}

export async function captureOrder(orderId: string, jobId: string) {
  return paypal(`/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    requestId: `${jobId}-capture`,
  });
}

export async function payoutMaya(jobId: string, amount: string, email: string) {
  return paypal("/v1/payments/payouts", {
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
          amount: { value: amount, currency: "USD" },
          receiver: email,
          note: "Maya share $800 of client $1,200",
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
