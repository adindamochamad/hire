# Devpost copy (English, paste into the submission)

## Project name

Hire

## Tagline

The job page where a client payment becomes Maya's payout.

## About

A small studio can agree a price with a client and a different share with the person who did the work, then lose both numbers in chat. Remote's 2025 survey of 3,300 freelancers found that 85% are paid late at least some of the time (https://remote.com/blog/contractor-management/reversing-late-payment-culture). Hire is one job page for that studio. The client pays $1,200. Maya receives $800. The studio keeps $400.

The model drafts the agreement from the notes. It cannot move money it cannot cite. Each amount must quote a message on the job. The server checks the quote and checks that the client amount equals Maya's share plus the studio remainder. PayPal opens only after Maya and the client agree, and the order uses the amounts stored on the job, not a fresh number from the model.

## What it does

1. Notes are saved on one job.
2. Draft calls Claude. The reply is a work summary, three amounts, and a quote for each figure, or a clarification question.
3. A quote that is not in the notes is rejected. The page stays unresolved and does not treat anyone as paid.
4. Maya and the client agree.
5. PayPal Agent Toolkit `create_order` uses the stored client amount. The buyer approves in the PayPal sandbox.
6. Agent Toolkit `pay_order` captures. A verified `PAYMENT.CAPTURE.COMPLETED` webhook is stored.
7. Only then does Payouts v1 send Maya's stored share. `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` closes her line. The studio remainder stays on the job.

If the model API is unavailable, a parser reads the notes and the page says it was parsed from notes, not a model. A new note that changes an amount after agreement locks payment until both people agree again.

## Built with

- PayPal Agent Toolkit: `create_order`, `pay_order`
- PayPal Orders v2 (through the toolkit; amount from the job row)
- PayPal Payouts v1: `POST /v1/payments/payouts`
- PayPal webhook signature verification: `POST /v1/notifications/verify-webhook-signature`
- Claude (`claude-sonnet-5-5` by default) via the Messages API
- Render (web service and Postgres)

Sandbox only. No live PayPal account.

## Built during the hackathon

The page, the cited draft, the sandbox order, capture, webhook, and Maya's payout were built for this hackathon. The demo URL is https://hire-brjt.onrender.com. The repo is https://github.com/adindamochamad/hire.
