# Hire

The job page where a client payment becomes Maya’s payout.

One job. The client pays **$1,200**. Maya receives **$800**. The studio keeps **$400**. Paid status exists only when a real PayPal sandbox id is stored.

Built for the [PayPal AI Hackathon](https://paypal-ai-hackathon.devpost.com/).

Live (Render): [https://hire-brjt.onrender.com](https://hire-brjt.onrender.com) — opens `hire-job-5`.

## What it does

1. Claude drafts the agreement from the studio notes (summary, $1,200, $800, $400). The server rejects a draft unless those amounts add up.
2. Maya and the client agree on the stored numbers.
3. The server creates a PayPal Orders v2 payment of **$1,200** from the database, not from a fresh model call.
4. After the client approves, the server captures the order.
5. Only after a verified `PAYMENT.CAPTURE.COMPLETED` webhook does the server send a Payouts v1 payment of **$800** to Maya’s sandbox email.
6. `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` closes Maya’s share. The job still shows the studio remainder of **$400**.

## PayPal APIs

Sandbox only (`https://api-m.sandbox.paypal.com`).

| Step | Endpoint |
| --- | --- |
| Create order | `POST /v2/checkout/orders` (intent `CAPTURE`, amount from the job row) |
| Capture | `POST /v2/checkout/orders/{id}/capture` |
| Verify webhook | `POST /v1/notifications/verify-webhook-signature` |
| Pay Maya | `POST /v1/payments/payouts` (`PayPal-Request-Id` and `sender_batch_id` from the job id) |

`platform_fees` is not used. In sandbox that fee does not appear in the balance, so it cannot be shown to judges.

## Local

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run dev
```

Open [http://127.0.0.1:3000/](http://127.0.0.1:3000/). The home route opens `hire-job-5`.

Required in `.env`: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MAYA_EMAIL`, `PAYPAL_WEBHOOK_ID`, `DATABASE_URL`, and `ANTHROPIC_API_KEY`. Never commit `.env`.

For local webhooks, expose `/api/webhooks/paypal` over HTTPS, then:

```bash
node scripts/subscribe-webhook.mjs https://your-https-host
```

Put the printed `webhookId` in `PAYPAL_WEBHOOK_ID`.

## Render

`render.yaml` defines a Node web service and Postgres. After the first deploy:

1. Set the `sync: false` env vars in the Render dashboard (PayPal sandbox + Anthropic). Do not paste them into git.
2. Point the PayPal webhook at `https://<service>.onrender.com/api/webhooks/paypal` and save the new webhook id as `PAYPAL_WEBHOOK_ID`.
3. Walk `hire-job-5` once on the live URL: draft, agree, pay $1,200, wait for Maya’s $800 payout. `hire-job-1` already spent its PayPal request ids in the local sandbox tests.

## License

MIT. See [LICENSE](LICENSE).
