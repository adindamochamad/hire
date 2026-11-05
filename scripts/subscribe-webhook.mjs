import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  process.env[trimmed.slice(0, eq)] ??= trimmed.slice(eq + 1);
}

const apiBase = process.env.PAYPAL_API_BASE;
const url = process.argv[2];
if (!apiBase || !url) {
  console.error("usage: node scripts/subscribe-webhook.mjs https://host");
  process.exit(1);
}

const auth = Buffer.from(
  `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
).toString("base64");
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
  console.error(tokenJson);
  process.exit(1);
}

const listRes = await fetch(`${apiBase}/v1/notifications/webhooks`, {
  headers: { Authorization: `Bearer ${tokenJson.access_token}` },
});
const listJson = await listRes.json();
const webhookUrl = `${url.replace(/\/$/, "")}/api/webhooks/paypal`;
const existing = (listJson.webhooks ?? []).find((hook) => hook.url === webhookUrl);
if (existing) {
  console.log(JSON.stringify({ webhookId: existing.id, url: existing.url, reused: true }, null, 2));
  process.exit(0);
}

const created = await fetch(`${apiBase}/v1/notifications/webhooks`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${tokenJson.access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    url: webhookUrl,
    event_types: [
      { name: "PAYMENT.CAPTURE.COMPLETED" },
      { name: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED" },
    ],
  }),
});
const createdJson = await created.json();
if (!created.ok) {
  console.error(created.status, createdJson);
  process.exit(1);
}
console.log(JSON.stringify({ webhookId: createdJson.id, url: createdJson.url, reused: false }, null, 2));
