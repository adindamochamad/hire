# Decisions

## 2026-11-04 — Rumah kerja & Stage 0

- Brief disimpan di folder proyek, bukan di root `Development/`, karena root itu berisi banyak proyek lain. Folder ini kemudian dinamai `hire/`.
- Belum ada repo, kode, atau ide. Stage 0 = draft, menunggu koreksi profil.
- Cek kelayakan Devpost 5 Nov tidak dikejar: sisa waktu sampai besok tidak cukup untuk submission yang lolos Stage One.
- Prize target dan sponsor belum dikunci pada siang dokumen ini. Dikunci pada entri berikut.

## 2026-11-04 — Profil, sponsor, dan ide

- Solo, full-time, full effort, mulai dari nol. Asumsi 4–6 jam/hari dibuang. Kapasitas rencana: 8 jam × 8 hari. Scope tetap satu alur.
- Stack di profil tidak dikoreksi.
- Sponsor yang dikejar: **Render** (web service untuk demo publik + worker untuk meter dan webhook). Sumber: https://paypalaihackathon.devpost.com/details/render dan FAQ (boleh memakai lebih dari satu tool, menang maksimal satu sponsor).
- AG Grid tidak dikejar. Blog sponsor mengarahkan peserta ke AG Studio dan contoh yang sudah ramai (anomaly dashboard, invoice nudge, natural-language finance): https://www.ag-grid.com/blog/hackathon-paypal-and-ag-studio/
- Channel3 tidak dikejar. Tool-nya adalah katalog produk untuk shopping agent: https://paypalaihackathon.devpost.com/details/channel3
- Render tetap boleh dipakai sebagai host meski hadiahnya kredit, karena worker + URL publik ada di jalur kritis demo. Produk tidak dibengkokkan agar menangi kredit itu.

## 2026-11-04 — Penilaian juri atas Delta Clerk

- Skor 11 lensa diturunkan dari 7,9 ke 5,5. Chance of winning dari 7 ke 3.
- Peluang yang ditulis: juara 1 ~2%, podium ~5%, honorable/sponsor ~10–15%, tidak menang ~80%. Ini penilaian, bukan data peserta.
- Verdict diubah dari GO ke **PIVOT**. Penyebab: AI bisa dihapus dan produk tetap jalan; klimaksnya idempotency; angka $113.440 terasa strawman bagi juri pembayaran.
- PRD tidak ditulis sampai bentuk AI-nya berubah.

## 2026-11-04 — Ganti ke Counteroffer

- Delta Clerk tidak dilanjutkan. Penggantinya **Counteroffer**: agent menjawab sengketa PayPal dengan `make-offer` (jumlah dan jenis tawaran dari teks pembeli + baris order), bukan `accept-claim` untuk seluruh nilai sengketa.
- API yang dipakai sudah ada di dokumen sandbox: buat sengketa SNAD sebagai buyer, `make-offer` dengan `REFUND` atau `REFUND_WITH_RETURN`, `accept-claim`, buyer `accept-offer`. Sumber: https://developer.paypal.com/disputes/test-go-live dan https://developer.paypal.com/platforms/disputes/integrate-disputes
- Peluang yang ditulis, masih penilaian: juara 1 ~6%, podium ~12%, ada hadiah ~22%, tidak menang ~78%. Lebih tinggi dari Delta Clerk, bukan favorit.
- Lubang yang tidak ditutup: dua skrip demo masih bisa ditiru rules engine; setup buyer-side credential adalah risiko jadwal. Kalau hari kedua sandbox sengketa tidak jalan, ide ini turun, bukan dipaksa.

## 2026-11-04 — Counteroffer ditutup, diganti Job Sheet

- Counteroffer di-DROP. Alasannya bukan API. Baunya masih kisah tentang agent yang salah, dan itu yang ditolak.
- Lomba mewajibkan pemakaian AI, tidak mewajibkan produknya berbentuk perumpamaan AI.
- Kandidat baru: **Job Sheet**. Studio menagih klien lewat PayPal Invoicing. Setelah `INVOICING.INVOICE.PAID`, bagian rekan dikirim lewat Payouts. Model hanya mengisi draf dari catatan job. Tidak ada kolom pembanding.
- Peluang jujur: juara 1 ~5% (turun dari ~6%), ada hadiah ~25% (naik dari ~22%), tidak menang ~75%. Umum tidak menaikkan peluang juara.

## 2026-11-04 — Job Sheet ditutup, diganti Hire

- Kamu menolak peluang yang tidak ikut naik. Job Sheet tidak masuk PRD.
- **Hire:** klien membayar $1.200 lewat order PayPal, Maya menerima payout $800, studio menyimpan $400. Asisten hanya menyusun perjanjian dari obrolan dan membuat order. Persetujuan ada di layar PayPal.
- `platform_fees` ditolak sebagai bukti demo: di sandbox fee itu tidak muncul di saldo.
- Peluang: juara 1 ~9%, podium ~15%, ada hadiah ~32%, tidak menang ~68%. Plafon yang saya percaya. Bukan 12%.

## 2026-11-04 — PRD Hire

- Kamu mengambil Hire. PRD ditulis di `docs/prd.md`.
- Scope dikunci: satu job, klien $1.200, Maya $800, studio $400. Order dari angka yang disimpan. Payout hanya setelah `PAYMENT.CAPTURE.COMPLETED`.
- Stack dikunci di PRD: Next.js + Postgres. FastAPI tidak ditambah.
- Build tidak mulai sampai PRD disetujui. `.cursor/rules/` belum dibuat.

## 2026-11-04 — Handoff untuk sesi baru

- `HACKATHON-PROMPT.md` disalin ke dalam folder ini dari `../paypal-hackathon-master-prompt.md`.
- `README.md` menjadi pintu masuk: stage 1.5, Hire, build belum mulai.

## 2026-11-04 — Folder proyek

- Folder `paypal-hackathon/` diubah namanya menjadi `hire/`. Nama produk tetap Hire. Prompt asli di luar folder tidak dipindah.

## 2026-11-04 — PRD Hire disetujui

- PRD di `docs/prd.md` disetujui di sesi ini, 4 Nov 2026 malam WIB. Itu kontrak scope.
- Build belum mulai. `.cursor/rules/` diusulkan di sesi yang sama.

## 2026-11-04 — Aturan Cursor

- Tiga file disetujui dan dibuat: `.cursor/rules/project.mdc`, `paypal.mdc`, `design.mdc`. Semuanya `alwaysApply`.
- Palet dan font sengaja belum dikunci. Halaman job menunggu uji capture $1.200 dan payout $800.

## 2026-11-04 — Kredensial sandbox

- Diambil dari dashboard developer setelah login, via browser Cursor. Disimpan di `.env`. `.env.example` tanpa nilai. `.gitignore` menolak `.env`.
- Aplikasi: Default Application. Payouts di app sudah aktif.
- Studio: akun bisnis sandbox, saldo USD 5.000, status Verified.
- Klien: akun personal default.
- Maya: akun personal baru, negara ID, dibuat malam ini.
- Secret tidak dicatat di dokumen ini.

## 2026-11-04 — Uji pertama PayPal lulus

- Order sandbox $1.200 di-approve klien, lalu di-capture. Capture id `8G270661F7168261A`, status COMPLETED.
- Payout $800 ke email sandbox Maya. Item id `896RRTNPZVAPC`, `transaction_status` SUCCESS, batch SUCCESS.
- Order id `38C36930XF251562W`. Id tersimpan di `sandbox-test-result.json`.
- Secret pertama gagal OAuth karena salah baca dari screenshot. Diambil ulang dari DOM.
- Webhook belum diuji. UI belum dibangun.

## 2026-11-04 — Webhook lulus

- Next.js + Postgres jalan lokal. Listener `POST /api/webhooks/paypal`.
- Tanda tangan dicek lewat `POST /v1/notifications/verify-webhook-signature` dengan body mentah. POST tanpa tanda tangan = 400, tidak disimpan.
- Event yang tersimpan hanya setelah verifikasi: `PAYMENT.CAPTURE.COMPLETED` (`WH-3L091541F3448922B-94X099993E4797518`) lalu payout $800, lalu `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` (`WH-0Y5578252U3454325-8T442406SW4766643`).
- Job `hire-job-2`: capture `8CB749217S759632M`, payout item `5Q278FBTZ3SRE`.
- Payout tidak dikirim dari respons capture. Baru setelah event capture terverifikasi.
- Draf model belum diuji: tidak ada `ANTHROPIC_API_KEY` atau `GEMINI_API_KEY` di `.env`. Endpoint menolak 503.
- Uji pertama tetap: satu order sandbox $1.200 yang di-capture, lalu payout $800. Kalau payout tidak jalan, Hire berhenti. Status bayar palsu tidak dibuat.

## 2026-11-05 — UI Client Portal

- Satu halaman job di `/jobs/hire-job-1`. `/` mengarah ke sana. Bukan landing konsep.
- Layout: thread + kartu perjanjian di kiri, rail uang di kanan (split $1.200 / $800 / $400, timeline, PayPal, bukti webhook).
- Palet: latar `#F6F4F0`, aksen teal `#0F766E`, sisa studio amber `#B45309`. Font: Fraunces + Figtree.
- Status klien dibayar / Maya dibayar hanya dari event webhook yang tersimpan, bukan dari tombol.

## 2026-11-05 — Alur UI + PayPal di hire-job-3

- `hire-job-1` tidak dipakai ulang: `PayPal-Request-Id` dan `sender_batch_id` job itu sudah terpakai di uji 4 Nov.
- Order sandbox `55W567392A068483P` $1.200 di-approve klien, capture `7F025743PF0972529`.
- Webhook `PAYMENT.CAPTURE.COMPLETED` (`WH-4H0763312G997512W-4LU48056G20289405`) baru memicu payout $800. Item `92YGAP88MPDRG`, event `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` (`WH-0C075008SB425264L-7VU23387FB970962C`).
- `/` mengarah ke `/jobs/hire-job-3`.

## 2026-11-05 — Cadangan draf

- Naskah cadangan di Activity: kata berbeda, angka tetap $1.200 / $800 / $400. Bukan alur baru.
- Draft API memakai thread yang sedang tampil, bukan hanya naskah utama.

## 2026-11-05 — Poles halaman job

- Perjanjian yang sudah dikunci tampil sebagai lembar, bukan field mati. Tombol yang tidak bisa dipakai lagi disembunyikan.
- Rail uang: angka lebih besar, sisa studio $400 di latar hangat, timeline punya garis. Alur tidak bertambah.
- Halaman disusun ulang seperti brief Doquo: judul kerja di atas, catatan di bawah, pecahan uang tetap di kanan.
