# Hire

The job page where a client payment becomes Maya’s payout.

The model drafts the agreement. **It does not choose the money that moves.** The client amount, Maya’s share, and the studio remainder come from the job row. The server rejects a draft unless those three numbers add up. Paid status exists only when a real PayPal sandbox id is stored.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).

Live (Render): [https://hire-brjt.onrender.com](https://hire-brjt.onrender.com)

The home page opens a **new job** (unique PayPal request ids) so each reviewer can start clean.

## What it does

1. Notes are stored per job. The server drafts `workSummary` and three amounts from the thread with quoted or calculated evidence. Ambiguous threads return clarification questions instead of guessed numbers. PayPal amounts always come from the job row after draft/save.
2. Maya and the client agree on the stored numbers.
3. After both parties agree, the server calls PayPal Agent Toolkit `create_order` with `jobs.client_amount`. The model does not pass the amount. `PayPal-Request-Id` is `${jobId}-order`.
4. After the client approves, the server captures with Agent Toolkit `pay_order`.
5. Only after a verified `PAYMENT.CAPTURE.COMPLETED` webhook, and only if the capture is the stored order for the stored client amount, does the server send a Payouts v1 payment of `jobs.maya_amount` to Maya’s sandbox email. The toolkit has no payouts tool.
6. `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` closes Maya’s share when the payout item amount matches. The job still shows the studio remainder.

The seed split is client **$1,200**, Maya **$800**, studio **$400**. Copy on the page reads those fields; it does not invent a second set of numbers. Client, Maya, and studio amounts must each be greater than zero.

## PayPal APIs

Sandbox only (`https://api-m.sandbox.paypal.com`).

| Step | How |
| --- | --- |
| Create order | PayPal Agent Toolkit `create_order` ([agent tools](https://developer.paypal.com/ai-tools/agent-tools); amount from the job row) |
| Capture | PayPal Agent Toolkit `pay_order` |
| Verify webhook | `POST /v1/notifications/verify-webhook-signature` |
| Pay Maya | `POST /v1/payments/payouts` (`PayPal-Request-Id` and `sender_batch_id` from the job id) |

`platform_fees` is not used. In sandbox that fee does not appear in the balance, so it cannot be shown to judges.

## Try the sandbox

1. Open the live URL. It creates a new job. If the first request is slow, wait; a keep-alive hits `/api/health`.
2. Add notes, including ambiguous figures if you want, then **Draft agreement from notes**.
3. Record Maya and client agreement.
4. Pay with a PayPal **sandbox** buyer account. This repo does not ship buyer passwords.
5. Capture, then wait for the capture webhook and Maya’s payout item id.

## Local

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:migrate
npm run dev
```

Tests: `npm run test:webhooks` (13 cases), `npm run test:agreement` (10 cases). Requires local Postgres with `DATABASE_URL`.

Open [http://127.0.0.1:3000/](http://127.0.0.1:3000/).

Required in `.env`: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_API_BASE`, `PAYPAL_MAYA_EMAIL`, `PAYPAL_WEBHOOK_ID`, `DATABASE_URL`, `APP_ORIGIN`, and `ANTHROPIC_API_KEY`. Never commit `.env`. `PAYPAL_API_BASE` is `https://api-m.sandbox.paypal.com`. On Render, `APP_ORIGIN` can be `RENDER_EXTERNAL_URL`.

For local webhooks, expose `/api/webhooks/paypal` over HTTPS, then:

```bash
node scripts/subscribe-webhook.mjs https://your-https-host
```

Put the printed `webhookId` in `PAYPAL_WEBHOOK_ID`.

## License

MIT. See [LICENSE](LICENSE).
