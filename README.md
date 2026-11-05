# Hire

The job page where a client payment becomes Maya’s payout.

The model drafts the agreement. **It does not choose the money that moves.** The client amount, Maya’s share, and the studio remainder come from the job row. The server rejects a draft unless those three numbers add up. Paid status exists only when a real PayPal sandbox id is stored.

Built for the [PayPal AI Hackathon](https://paypal-ai-hackathon.devpost.com/).

Live (Render): [https://hire-brjt.onrender.com](https://hire-brjt.onrender.com)

Press **New Job** for a unique row (and unique PayPal request ids) so each reviewer can start clean.

## What it does

1. Notes can be free-form, including negotiation and messy numbers. Claude drafts `workSummary` plus three amounts. The server rejects the draft unless the stored split adds up.
2. Maya and the client agree on the stored numbers.
3. The server creates a PayPal Orders v2 payment from `jobs.client_amount`, not from a fresh model call. `PayPal-Request-Id` is `${jobId}-order`.
4. After the client approves, the server captures the order.
5. Only after a verified `PAYMENT.CAPTURE.COMPLETED` webhook, and only if the capture is the stored order for the stored client amount, does the server send a Payouts v1 payment of `jobs.maya_amount` to Maya’s sandbox email.
6. `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` closes Maya’s share when the payout item amount matches. The job still shows the studio remainder.

The seed split is client **$1,200**, Maya **$800**, studio **$400**. Copy on the page reads those fields; it does not invent a second set of numbers.

PayPal Agent Toolkit `create_order` is not used for capture or payout. That tool would let a model pick the amount. Hire calls Orders v2 and Payouts v1 with the job row and job-id idempotency keys instead.

## PayPal APIs

Sandbox only (`https://api-m.sandbox.paypal.com`).

| Step | Endpoint |
| --- | --- |
| Create order | `POST /v2/checkout/orders` (intent `CAPTURE`, amount from the job row) |
| Capture | `POST /v2/checkout/orders/{id}/capture` |
| Verify webhook | `POST /v1/notifications/verify-webhook-signature` |
| Pay Maya | `POST /v1/payments/payouts` (`PayPal-Request-Id` and `sender_batch_id` from the job id) |

`platform_fees` is not used. In sandbox that fee does not appear in the balance, so it cannot be shown to judges.

## Try the sandbox

1. Open the live URL. If the first request is slow, wait; a keep-alive hits `/api/health`.
2. Press **New Job**.
3. Add notes, including ambiguous figures if you want, then **Draft agreement from notes**.
4. Record Maya and client agreement.
5. Pay with a PayPal **sandbox** buyer account. This repo does not ship buyer passwords.
6. Capture, then wait for the capture webhook and Maya’s payout item id.

## Local

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run dev
```

Open [http://127.0.0.1:3000/](http://127.0.0.1:3000/).

Required in `.env`: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MAYA_EMAIL`, `PAYPAL_WEBHOOK_ID`, `DATABASE_URL`, and `ANTHROPIC_API_KEY`. Never commit `.env`.

For local webhooks, expose `/api/webhooks/paypal` over HTTPS, then:

```bash
node scripts/subscribe-webhook.mjs https://your-https-host
```

Put the printed `webhookId` in `PAYPAL_WEBHOOK_ID`.

## License

MIT. See [LICENSE](LICENSE).
