# PRD: Hire

*Hackathon: PayPal AI Hackathon | Deadline: 13 Nov 2026 03:00 WIB | Tim: solo (Adinda), full-time*  
*Disetujui sebagai kontrak scope pada 4 Nov 2026 malam. Build belum mulai.*

## 1. One-Liner

The job page where a client payment becomes the maker's payout.

## 2. Insomnia Question

When a client pays the studio, does the person who did the work get their share?

Bukan adegan model yang sengaja salah. Pertanyaannya soal uang studio.

## 3. Target User & Pain

- **Primary user:** pemilik studio kecil, satu klien, satu rekan (Maya, UI).
- **Pain:** harga ke klien, bagian rekan, dan sisa studio hidup di chat. Pembayaran klien dan pembayaran rekan adalah dua urusan yang mudah tidak sama.
- **Stakes:** klien membayar **$1.200**. Maya harus menerima **$800**. Studio menyimpan **$400**. Kalau Maya dibayar sebelum klien membayar, studio yang menanggung.

## 4. Solution & Ambition

- **Core:** satu job. Asisten membaca obrolan dan mengisi draf perjanjian. Dua orang setuju pada angka yang sama. Asisten membuat order PayPal sebesar harga klien. Klien membayar di layar PayPal. Setelah capture masuk, payout bagian Maya terkirim. Job menunjukkan ketiga angka dan kedua event.
- **Kalau berhasil:** studio tidak lagi mencocokkan chat dengan dua halaman PayPal.
- **Sequel:** banyak rekan pada satu job, lalu banyak job. Tidak dibangun sekarang.

## 5. Scope MVP

- **MUST HAVE**
  1. Satu job bernaskah tetap: landing page, dua revisi, klien $1.200, Maya $800, studio $400.
  2. Draf dari model, bisa diedit, lalu kedua pihak setuju. Order PayPal memakai angka yang tersimpan, bukan angka baru dari model.
  3. Klien approve dan capture di sandbox. Webhook `PAYMENT.CAPTURE.COMPLETED` tersimpan. Payout $800 ke Maya hanya setelah itu. Webhook `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` tersimpan. Sisa $400 terlihat di job.
- **NICE TO HAVE**
  - Tampilan obrolan yang terasa seperti pekerjaan, bukan widget chat.
  - Satu kalimat cadangan di video, dengan kata berbeda, yang menghasilkan angka yang sama.
- **OUT OF SCOPE**
  - Kolom agent bodoh vs agent pintar, sengketa, invoice, subscription, `platform_fees`, banyak rekan, banyak job, multi-currency, akun live, aplikasi mobile.

`platform_fees` tetap di luar. Di sandbox fee itu tidak muncul di saldo, jadi tidak bisa ditunjukkan ke juri.

## 6. The Demo

- **Momen yang diingat:** layar PayPal menunjukkan $1.200, lalu akun Maya menerima $800, dan job masih menyimpan $400.
- **Sebelum / sesudah, satu job:** sebelum dibayar, bagian Maya tidak terkirim. Sesudah capture, payout-nya ada. Bukan dua produk berdampingan.
- **Video, di bawah 3 menit**
  - 0:00–0:10 — tiga angka pada satu job.
  - 0:10–0:35 — studio, Maya, dan klien. Masalahnya: chat dan pembayaran terpisah.
  - 0:35–2:15 — draf, setuju, bayar di PayPal, capture, payout Maya, sisa studio.
  - 2:15–2:45 — satu frame: obrolan → order → capture → payout.
  - 2:45–2:55 — job berikutnya adalah rekan kedua. Tidak diperlihatkan sebagai fitur.
  - Tutup: "The client pays for the job. Maya receives her share."

## 7. Judging Criteria Mapping

| Kriteria (20% masing-masing) | Bagaimana kita buktikan di demo |
|---|---|
| Technological Implementation | Order sandbox di-approve dan di-capture. Payout $800 sukses. Kedua webhook tampil di job, terikat pada id PayPal. |
| Design | Satu halaman job yang selesai, dari obrolan sampai sisa $400. Bukan landing page konsep. |
| Potential Impact | Satu studio, satu rekan, tiga angka yang sama dengan yang dibayar. |
| Innovation/Idea | Harga klien dan bagian rekan berbeda, dan keduanya keluar dari satu perjanjian yang disetujui. |
| Presentation | Video hanya merekam alur di atas, tanpa slide dan tanpa musik berlisensi. |

Tie-break ada di baris pertama. Karena itu hari pertama build hanya PayPal.

## 8. Tech Stack, Integrasi & Risiko

- **Stack:** Next.js (TypeScript) dan Postgres, satu aplikasi. Dipilih karena itu stack web terkuat di profil dan cukup untuk satu deploy. FastAPI tidak ditambah.
- **PayPal, sandbox saja**
  - `POST /v2/checkout/orders` sebesar $1.200, intent capture. Klien membuka link approve. Lalu `POST /v2/checkout/orders/{id}/capture`.
  - Webhook diverifikasi. Event yang menutup pembayaran klien: `PAYMENT.CAPTURE.COMPLETED`.
  - Setelah status itu tersimpan, `POST /v1/payments/payouts` sebesar $800 ke email sandbox Maya, dengan `PayPal-Request-Id` dan `sender_batch_id` dari id job.
  - Event yang menutup bagian Maya: `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`.
  - Secret di `.env`, ada `.env.example`, tidak di-commit.
- **AI:** satu model yang sudah kamu pakai (Claude atau Gemini). Satu keluaran terstruktur: ringkasan kerja, harga klien, bagian Maya, sisa studio. Server menolak draf jika $1.200 ≠ $800 + $400. Create-order membaca database, bukan keluaran model yang baru.
- **Risiko terbesar:** akun bisnis sandbox tidak bisa mengirim payout. Mitigasi: ini uji pertama, 5 Nov, sebelum UI. Kalau gagal, Hire berhenti dan keputusannya dicatat. Tidak ada payout palsu.
- **Backup:** video yang sudah direkam, naskah job tetap, dan README dengan dua akun sandbox. Tidak ada mode mock yang berpura-pura uangnya sudah bergerak.

## 9. Prize Stacking

- **Utara:** Grand, juara 1. Peluang yang ditulis saat ide dikunci: ~9%. Bukan target yang diubah di PRD.
- **Sponsor:** Render, untuk aplikasi dan Postgres. Klaim "best use" hanya jika worker Render benar-benar menerima webhook. Kalau ia hanya host, kita tidak menulis klaim itu.
- **Tidak dikejar:** AG Grid, Channel3, Agentic Commerce sebagai label. Asisten yang membuat order sudah cukup untuk cerita produknya.

## 10. Timeline

Kapasitas ~8 jam/hari. Buffer ada di 11–12 Nov: tidak ada fitur baru. Kunci video dan teks Devpost **12 Nov 2026, 18:00 WIB**. Deadline lomba **13 Nov 2026, 03:00 WIB**.

| Hari | Kerja | Selesai bila |
|---|---|---|
| 4 Nov | PRD ini, lalu uji PayPal | Disetujui. Capture `8G270661F7168261A` COMPLETED. Payout item `896RRTNPZVAPC` SUCCESS |
| 4 Nov malam | Webhook capture + payout | Event terverifikasi tersimpan di `hire-job-2`. Draf model menunggu kunci API |
| 5 Nov | Draf model, edit, dua kali setuju, order dari database | Angka di PayPal sama dengan angka yang disetujui |
| 6 Nov | Cadangan draf + order | Tidak menambah alur |
| 7–8 Nov | Satu halaman job dan statusnya | Sebelum bayar, payout tidak terkirim |
| 9 Nov | Deploy Render, README, `.env.example`, data video | URL incognito membuka job yang sama |
| 10 Nov | Poles visual satu halaman | Tidak menambah alur |
| 11 Nov | Rekam video dan draf Devpost | Satu take utuh di bawah 3 menit |
| 12 Nov | Ambil ulang kalau perlu, lalu submit | Tidak ada fitur setelah 18:00 WIB |

## 11. Submission Checklist

- [x] Capture dan payout sandbox lulus lokal (4 Nov). Belum di URL deploy
- [ ] Capture dan payout jalan di URL yang di-deploy, diuji ulang setelah deploy
- [x] Draf model terlihat, dan order tidak memakai angka liar (lokal, 5 Nov). Belum di URL deploy
- [x] Repo publik, LICENSE di About, README, `.env.example`, tanpa secret
- [ ] Video di bawah 3:00, YouTube publik, aplikasi berjalan, tanpa musik berlisensi
- [ ] Teks Devpost bahasa Inggris: masalah, alur, API PayPal, model yang dipakai, apa yang dibangun selama lomba
- [ ] Semua materi submission bahasa Inggris
