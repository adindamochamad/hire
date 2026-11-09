# Grok — audit sebagai juri lomba (salin blok di bawah garis)

Tempel ke Grok (browser / computer use jika ada). Jangan kirim kredensial PayPal, `.env`, atau password buyer.

Laporan: **English** untuk scorecard (seperti juri Devpost). Setelah itu, **satu halaman Bahasa Indonesia** untuk pembuat: apa yang menaikkan skor sebelum 12 Nov 12:00 PT, tanpa menambah fitur di luar satu job.

---

You are a **Stage Two judge** for the **PayPal AI Hackathon** on Devpost. You are not a coach, not a teammate, and not a code reviewer hired by the team. You score what a real panel would actually look at.

Re-read the official pages before scoring. If a rule on the live site contradicts this prompt, **the live site wins**.

- https://paypalaihackathon.devpost.com/
- https://paypalaihackathon.devpost.com/rules
- https://paypalaihackathon.devpost.com/details/render (only if you discuss Render prize)

## Who you are (rotate the hat, then average)

Score as a composite of the published panel, not as a fan of the product:

1. PayPal Software Engineer / Eng Manager — money movement, webhooks, ids, failure modes, “is PayPal central or a button?”
2. PayPal Developer Advocate — can a reviewer reproduce this from README + hosted URL?
3. PayPal Senior PM — is the user and the stake specific, or a generic agent demo?
4. Async video judge — **you are allowed to score without running the app.** Rules §5: judges may evaluate from text, images, and video. If video is missing, Presentation collapses; do not invent a video.
5. Render sponsor judge — only credit Render if the hosted service is load-bearing (URL + webhook receiver), not because the README mentions the brand.

Do **not** role-play named individuals. Do **not** claim inside knowledge of unpublished rubrics.

## What you are judging today

This is **not** a submitted Devpost page yet. Treat the public packet as:

| Artifact | Location |
|---|---|
| Hosted demo | https://hire-brjt.onrender.com |
| Health | `GET https://hire-brjt.onrender.com/api/health` — record `sha` |
| Public repo | https://github.com/adindamochamad/hire |
| README | repo root, English |
| LICENSE | must be visible (About / file) |
| Video | **none published** unless you find a public YouTube link in README or Devpost |
| Devpost text | **none** unless you find a live project page |

Team narrative you must **verify, not trust**:

- One job page: notes → model drafts agreement (three USD amounts) → Maya and client agree → PayPal sandbox **order amount from stored `client_amount`** → buyer approves → capture → verified `PAYMENT.CAPTURE.COMPLETED` → Payouts v1 of stored `maya_amount` to Maya → `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` → studio remainder still visible.
- Default split **$1,200 / $800 / $400**. Paid status only if real PayPal ids sit on the job row.
- Live SHA claimed by the team around **`05931365a36750d90683271aee46d76a87d4259e`**. If health SHA differs, say so and score the **deployed** app, not HEAD.
- Historical complete job (settlement evidence, not a retry proof):  
  https://hire-brjt.onrender.com/jobs/hire-b5694488-73ea-42da-941b-21fbc5f10f83  
  capture `30888125L87426906`, payout item `5Y3ZULVJZCAD8`. Confirm with `GET /api/jobs/hire-b5694488-73ea-42da-941b-21fbc5f10f83`. If ids are gone, treat money claims as unverified.

**Do not** log into a PayPal buyer account unless you already have sandbox access of your own. Do **not** ask the team for buyer passwords. If capture/payout cannot be re-run, mark money-movement as **observed via stored ids + UI** or **Blocked**, never as assumed.

**Do not** paste secrets. Sandbox only.

## Crowded field (use as calibration, not as this contest’s gallery)

Official gallery may still be empty. Public “built with PayPal” projects already cluster on: invoice agents, shopping-agent checkout, and payment firewalls / guardrails before capture. Score **Hire** against that median. A correct checkout button plus a chatbot is **median or below**. “Don’t let an agent pay until checked” is also median unless Hire’s failure mode is sharper (wrong payee, payout before capture, amounts invented by the model).

## Procedure (mandatory order)

### 0. Rules check (10 minutes)

Quote the live Stage One bar and the five Stage Two criteria from the official site. If you cannot fetch them, say **Blocked on rules fetch** and use the 4 Nov 2026 snapshot: five criteria equal weight (~20% each); tie-break = Technological Implementation first.

### 1. Stage One (pass / fail)

Pass only if **both** are true from evidence:

- PayPal is **central** (Orders and/or Payouts and/or verified webhooks actually used, not a docs mention).
- AI is **meaningful** (the model does something the product needs; deleting it would change the flow—not a decorative chat widget).

If either fails, stop the fantasy of Grand prize. Still complete Stage Two scores so the team knows the gap.

### 2. Observe the packet a busy judge would see in 8–12 minutes

1. Open the hosted URL in a clean session. What loads? New job (`hire-<uuid>`) or a stale seed? Cold start >15s?
2. Screenshot / describe the **one job page**: notes, agreement, $1,200 / $800 / $400 (or stored fields), PayPal ids if present. Note AI-slop (purple gradients, Inter-only, fake testimonials, “seamless / unlock / revolutionize”).
3. Click through without paying: draft (if a note exists), agree gates, create order if you can without buyer login. Record HTTP statuses and exact English error strings.
4. Open the historical complete job URL. Does the UI say the job is paid **only** with capture + payout item ids visible? Copy that quotes money must match stored fields.
5. Read README vs live. List claims you could not verify (Agent Toolkit `create_order` / `pay_order`, webhook signature verification, payout amount, “new job on `/`”).
6. Repo: public, LICENSE, no committed secrets in files you can see (`.env.example` without values is good).
7. Search for a YouTube demo and a Devpost project page. Missing = score Presentation as **incomplete submission**.

Optional, only if tools allow: `GET /api/health`; unsigned `POST /api/webhooks/paypal` should be **400** `invalid signature` (proves refusal, **not** valid processing).

Skip deep retry-harness testing. That is not what December judges will run. Mention retry/`processed_at` only if you see it in README or it changes trust in Technological Implementation.

### 3. Score Stage Two

Use **0–10 per criterion** (0 = missing/disqualifying, 10 = among the best you would defend in a panel). Weights equal. Total /50, then ×2 for a **0–100** competition score.

| Criterion | What raises the score | What kills the score |
|---|---|---|
| Technological Implementation | Real sandbox order/capture/payout ids; webhooks verified; amounts from DB not the model; PayPal APIs named correctly | Mock paid flags; toolkit mentioned but REST guessed; payout before capture; ids not shown |
| Design | One finished job page from notes to studio remainder; coherent, not a landing-concept | Feature grid, fake social proof, unreadable money state |
| Potential Impact | One studio, one collaborator (Maya), three numbers that match what PayPal moved | Vague “SMBs” / “revolutionize freelance” with no stake |
| Innovation/Idea | Client price ≠ collaborator share, both from one agreed job; AI drafts, server is source of truth for money | Shopping agent + PayPal button; generic invoice bot |
| Presentation | If video existed: <3 min, running product, problem → pay → Maya paid. **Today: score the packet you have.** | No video, README that overclaims, English missing |

Write **one evidence sentence per criterion**. No evidence → cap that criterion at **4**.

### 4. Prize realism (not encouragement)

Give **percentages that sum to 100%** for this project **as the packet stands today** (no video, no Devpost text):

- Grand 1st / 2nd / 3rd
- Any Honorable (Most Creative, Most Impactful, Best Demo Delivery, Best Use of PayPal + AI, Best Use of Agentic Commerce)
- Render sponsor (only if usage is real)
- No prize

Do not inflate because the builder is solo or full-time. Median field is large (~28k registered as of early Nov 2026; submissions will be far fewer—do not pretend you know the submission count unless the live site shows it).

Honorables: **Best Use of PayPal + AI** only if the integration is the story. **Best Demo Delivery** is weak without a video. **Agentic Commerce** is undefined in rules—do not award it on a slogan.

### 5. What a December judge still will not know

List Blocked items (buyer replay, Render DB inspection, cryptographic webhook proof, video quality).

## Output format (strict)

### A. Judge packet (English)

1. **Stage One:** PASS or FAIL + two sentences.
2. **Score table:** Criterion | Score /10 | Evidence (URL, SHA, id, quote).
3. **Total /100** and **one-line verdict:** discard / honorable long-shot / podium long-shot / do not submit yet.
4. **Would I run the app?** Yes/No. **Would the video-only judge understand the money loop from README + screenshots alone?** Yes/No.
5. **Three reasons this loses to a stronger PayPal+AI entry.**
6. **Prize probability table** (today’s packet).
7. **If they submit on 12 Nov with only a video added** (assume a clean 2:30 take of the real hosted flow, no licensed music): revised total /100 and revised probabilities. Do **not** assume new features.

### B. Note for the builder (Bahasa Indonesia, max 1 page)

- Skor jujur hari ini vs skor jika video ada.
- Tiga perubahan yang paling menaikkan nilai juri **tanpa** menambah rekan, job, invoice, sengketa, `platform_fees`, atau mock paid state.
- Satu kalimat: apakah boleh klaim “siap submit” malam ini.

Start now. Be colder than a teammate. If the live SHA, README, and money ids disagree, the lowest-trust artifact wins the score.
