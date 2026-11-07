# Catatan sesi (bukan submission)

Sesi baru di folder `hire/`. Jangan andalkan chat sebelumnya. README akar berbahasa Inggris untuk juri.

## Sekarang

- Stage **2 → 3 prep**. Audit Grok v3 (**CONDITIONAL**, 7 Nov ~10:24–10:26 WIB): custom split + draft + agree + sandbox **order** lulus; capture/payout **blocked** (buyer login). Live **belum** SHA `128de31` — `/` masih 307 ke `hire-job-5` (`x-nextjs-cache: HIT`), PATCH `2000/0/2000` masih **200**. Recheck 10:35 WIB sama.
- Setiap demo: mulai dari **New Job**, jangan seed. Jangan klaim paid tanpa `paypal_capture_id` / `paypal_payout_item_id`.
- Job bukti lokal: **`hire-job-3`**. Prompt: `docs/grok-audit-prompt.md`. Hasil: `audit-demo-v3.md`.
- Deadline: **13 Nov 2026, 03:00 WIB**. Video/Devpost **setelah** live SHA baru + satu run buyer sandbox.

## Bukti uang (sandbox, lokal)

| Job | Capture | Payout Maya |
|---|---|---|
| hire-job-1 (skrip, 4 Nov) | `8G270661F7168261A` | `896RRTNPZVAPC` |
| hire-job-2 (webhook) | `8CB749217S759632M` | `5Q278FBTZ3SRE` |
| hire-job-3 (halaman job) | `7F025743PF0972529` | `92YGAP88MPDRG` |

Payout $800 hanya setelah `PAYMENT.CAPTURE.COMPLETED` terverifikasi.

## Urutan baca

1. `docs/prd.md`
2. `docs/decisions.md`
3. `docs/competition-brief.md`
4. `.cursor/rules/` : `project.mdc`, `paypal.mdc`, `design.mdc`
