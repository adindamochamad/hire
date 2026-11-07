# Grok audit prompt (copy everything below the line)

Paste the block into Grok (with browser / computer use if available). Reply in **Indonesian** in the audit write-up; quote **English** UI strings and API errors exactly.

---

You are auditing **Hire** for the PayPal AI Hackathon before we record submission video and write Devpost copy. Be skeptical like a PayPal engineer judge. **Do not** assume features work—observe or call APIs and report evidence.

## Context

- **Live app:** https://hire-brjt.onrender.com
- **Repo (public):** https://github.com/adindamochamad/hire
- **Product:** One job page: chat notes → AI drafts agreement (three USD amounts) → Maya + client agree → PayPal sandbox order for **stored** `client_amount` → client approves → capture → verified webhooks → payout of **stored** `maya_amount` to Maya’s sandbox email → studio remainder stays visible.
- **Seed split (default):** client **$1,200**, Maya **$800**, studio **$400**.
- **Hard rules:** Paid state only with real PayPal ids in the job row. Server rejects amounts unless `client = maya + studio` and all three > 0. Model must not be the source of truth for money on create-order.
- **Previous audit (5 Nov):** Custom splits failed with 422; only 1200/800/400 worked. **Re-test this first**—we shipped a fix.

## Your deliverable

Write **`audit-demo-v3.md`** style report with:

1. **Executive summary** (pass / conditional / fail for demo-ready)
2. **Table:** Area | Pass/Fail/Blocked | Evidence (URL, HTTP status, ids, screenshots paths if any)
3. **Blockers for hackathon demo** (numbered, severity)
4. **Nice-to-fix** (non-blocking)
5. **Cannot verify** (what you lacked: buyer sandbox login, time, tools)

## Test plan (run in this order)

### A. Availability

1. `GET https://hire-brjt.onrender.com/api/health` — expect `{"ok":true}`.
2. Open `/` in a clean session — should create or land on a **new** job id (`hire-<uuid>`), not only a fixed seed id.
3. Note cold-start time if first load is slow (>15s).

### B. Custom amounts (regression — critical)

4. On a **new job**, use UI **or** API:
   - `POST https://hire-brjt.onrender.com/api/jobs` → note `job.id`.
   - `PATCH /api/jobs/{id}` with JSON **camelCase**:
     ```json
     {
       "workSummary": "Landing page and two revision rounds.",
       "clientAmount": "2000.00",
       "mayaAmount": "1200.00",
       "studioAmount": "800.00"
     }
     ```
     Expect **200** and stored amounts 2000/1200/800. If **422**, capture exact error body—this is a **P0** fail.
5. Add a free-form note with different numbers, run **Draft agreement from notes** on example thread—does AI draft respect negotiation or only seed? Log success vs `draft rejected` message.
6. Try invalid split via PATCH (e.g. 2000/900/800) — expect **422**.

### C. Agreement → order (no PayPal login yet)

7. **Agree** as Maya and Client — both should succeed; status moves toward payment.
8. **Pay $… on PayPal** — `POST /api/jobs/{id}/order` should return order id; UI shows approve link to `sandbox.paypal.com`.
9. Confirm displayed pay amount matches **stored** `client_amount` (test with 2000 job if step B passed).

### D. PayPal sandbox money movement (needs buyer sandbox)

If you can log into a **PayPal sandbox personal/buyer** account:

10. Approve the order on PayPal, return to app, **Capture order**.
11. Wait for webhook processing (poll `GET /api/jobs/{id}` for `paypal_capture_id`, events list).
12. Confirm `PAYMENT.CAPTURE.COMPLETED` appears in Payment Records with matching amount.
13. Confirm Maya payout item id appears and `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` (or clear pending state); payout amount must match **stored** `maya_amount`.
14. Job still shows studio remainder; copy mentions client / Maya / studio amounts from fields, not invented text.

If you **cannot** log in as buyer, mark D as **Blocked** and say what credentials/step stopped you.

### E. Errors & polish

15. `GET /jobs/nope-xyz` — expect friendly 404, not stack trace.
16. Desktop full-page screenshot after order created (path in report).
17. Optional: narrow mobile viewport — note if layout breaks badly.
18. Skim UI for generic AI-slop (purple gradients, Inter-only, fake testimonials)—brief note.

### F. Submission readiness (no video yet)

19. README on GitHub: sandbox steps, env vars, no secrets—accurate vs what you saw live?
20. Any claim in README you could **not** verify on live URL—list them.

## Judging lens (20% each—one line each)

| Criterion | Your verdict + one evidence sentence |
|---|---|
| Technological Implementation | |
| Design | |
| Potential Impact | |
| Innovation/Idea | |
| Presentation (demo **would** show) | |

## Constraints

- Sandbox only; do not use production PayPal.
- Do not commit or paste secrets from `.env`.
- Do not treat Maya as paid without `paypal_payout_item_id` on the job.

Start now. Prioritize **B** and **D**. Be explicit when production lags behind repo (e.g. custom PATCH still 422 after fix merged).
