# Video shot list

Public YouTube, under 3:00, no licensed music. Record the live app, not a mock. Leave the PayPal ids readable.

## 0:00–0:20 Problem

A small studio subcontracts work to Maya. Say the client price and Maya's share out loud: $1,200 and $800, with $400 left for the studio. One sentence on the stake: 85% of freelancers in Remote's 2025 survey are paid late at least some of the time, and the numbers usually live in chat. Cut to the empty job. The split shows dashes, not $1,200.

## 0:20–2:20 Demo

1. Add three notes: the client pays $1,200, Maya's share is $800, the studio keeps $400. Include the work (landing page, two revisions).
2. Click **Draft agreement from notes**. Wait for the draft run: model name, latency, tokens, validation `pass`.
3. Open **Why these numbers?** and click a quote so the note highlights. Say: the model cannot move money it cannot cite.
4. Agree as Maya, then as the client. The timeline step **Agreed** completes.
5. Pay on PayPal sandbox. The checkout shows **$1,200.00**. Approve and return.
6. Capture. Refresh until **Captured** shows `PAYMENT.CAPTURE.COMPLETED` and the capture id.
7. Wait until **Payout sent** shows `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` and Maya's payout item id. The page still shows the studio keeps $400.

Do not say anyone is paid before those ids are on screen.

## 2:20–2:50 How it is built

One sentence each, over the page or a simple diagram:

- Claude drafts. The server checks every quote against the notes and checks the sum.
- Order and capture use the PayPal Agent Toolkit with the stored client amount.
- Maya is paid with Payouts v1 only after the verified capture webhook.
- The app and Postgres run on Render.

## Close

"The client pays for the job. Maya receives her share."

If time remains inside the 3 minutes, add one note with a different amount after agreement and show **Agreement drift** blocking PayPal until both agree again. Cut it if the main path is already near 2:50.
