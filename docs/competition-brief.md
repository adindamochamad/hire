# Competition Brief — PayPal AI Hackathon

*Stage 2 berjalan. Capture, payout, webhook, draf, dan halaman job lulus lokal (5 Nov 2026).*  
*Sumber lomba dicek 4 Nov 2026. Klaim tanpa URL = tidak dipakai.*

## Status sesi

- Stage saat ini: **2**. Capture, payout, webhook, draf model, dan halaman job lulus. Job bukti UI: `hire-job-3`.
- Terkunci: solo, full-time, Next.js + Postgres, sandbox saja, satu job ($1.200 / $800 / $400).
- Berikutnya: cadangan draf, deploy Render, repo publik, video.
- Rumah kerja: `hire/`. Repo belum dibuat.

---

## 🎯 COMPETITION BRIEF

- **Arketipe:** Corporate / Sponsor Challenge × Marathon × Online / Async Video.
- **Domain:** FinTech / Payments × AI Agents. Hybrid. Bukan Web3, bukan consumer-app generik.
- **Winning Formula:** Satu alur PayPal sandbox yang benar-benar bergerak (bukan tombol tempel) + AI yang mengambil keputusan/aksi yang terlihat dan bisa diaudit, dibungkus jadi produk utuh, lalu dibuktikan di video < 3 menit. Juri engineer PayPal akan membuang integrasi dangkal; juri async mungkin tidak pernah menjalankan aplikasinya.
- **Bobot Penilaian:** Stage One = lolos/gagal (proyek masuk tema dan memakai API/SDK yang diminta). Stage Two = 5 kriteria **setara**. Tie-break = skor kriteria pertama, yaitu Technological Implementation, lalu kriteria berikutnya berurutan. (Rules §6.)
- **Profil Juri:** Mayoritas PayPal (3 Developer Advocate, 1 Software Engineer, 1 Engineering Manager, 1 Senior PM) + satu wakil tiap sponsor (AG Grid, APIMatic, Bryntum, Channel3, Elastic, Postman, Render). Mereka kenal API-nya. Rules juga mengizinkan panel, peer review, atau analisis AI — nama juri bisa berubah.
- **Median Threat:** Proyek publik Devpost ber-tag PayPal (bukan gallery lomba ini — gallery resmi belum terbit) sudah mengumpul di: invoice agent, shopping agent + checkout, dan payment firewall / guardrail sebelum capture. Zona itu dihindari sebagai ide utama, kecuali angle-nya satu tingkat lebih dalam dari yang sudah terlihat.
- **Diferensiasi:** Failure mode uang yang spesifik (penerima, duplikat, mandat, bukti vs klaim) untuk satu pengguna yang sempit, dengan PayPal sebagai mesin alur dan AI sebagai keputusan yang kelihatan. Bukan "AI shopping assistant + tombol PayPal".
- **Prize Stacking:** 1 Grand atau 1 Honorable, plus 1 Sponsor. Utara: **Grand 1st**. Cadangan honorable: Best Use of PayPal + AI, hanya jika integrasinya yang menjadi cerita. Sponsor yang dikejar: **Render**.
- **Effort Allocation** (full-time, rencana 8 jam × 8 hari ≈ 64 jam, 5–12 Nov; kunci video 12 Nov sore WIB; deadline tetap 13 Nov 03:00 WIB):
  - Ide + PRD: **8%** (~5 jam)
  - PayPal sandbox end-to-end + loop AI: **38%** (~24 jam)
  - Desain satu layar: **22%** (~14 jam)
  - Deploy Render, README, data demo: **12%** (~8 jam)
  - Video + teks Devpost: **20%** (~13 jam)
  - Jam ekstra, kalau ada, masuk ke webhook, data deterministik, dan pengambilan ulang video. Bukan fitur baru.
- **Hari tersisa:** **8 hari 5 jam** dari 4 Nov 2026 21:47 WIB ke **13 Nov 2026 03:00 WIB**. Full-time menambah kapasitas, tidak menambah hari.
- **Unknowns:** Lihat bagian bawah. Yang sudah ditutup di brief ini tidak diulang sebagai unknown.

---

## Domain — bias yang dipakai sebagai filter

Dikonfirmasi: **FinTech × AI/Agents**.

| Sisi | Yang juri domain ini hargai | Yang langsung mencurigakan |
|---|---|---|
| AI / Agents | Aksi nyata, guardrail, jejak keputusan yang bisa diaudit | Chatbot di pojok, rekomendasi tanpa transaksi |
| FinTech / Payments | Salah kirim / salah jumlah / salah penerima ditangani; sandbox yang konsisten; tidak main-main dengan uang | Tombol Checkout di akhir, saldo fiktif, "AI membayar" tanpa bukti order/capture/webhook |

Contoh dari domain yang sama, dengan sumber. Ini sinyal keramaian, **bukan** daftar peserta resmi lomba ini.

Gallery resmi lomba: https://paypalaihackathon.devpost.com/project-gallery — *"The hackathon managers haven't published this gallery yet"* (4 Nov 2026).

Proyek publik di https://devpost.com/software/built-with/paypal (diambil 4 Nov 2026), semuanya sudah PayPal + AI:

- Invoice / tagih: Invoice Cash Agent, InvoicePilot, PaidPilot, ScopeLock, TakeHome, Morning Assistant
- Belanja / checkout agent: CartPilot AI, Shelfie Street, Agent Shelf, Shipgrade Checkout
- Guardrail sebelum uang bergerak: Agent Payment Firewall, agent-spend-guard, Agent Guardian, VendorTrust, PACT Verify, PayPal Resolve

Pola yang sudah ramai: *"jangan biarkan agent membayar sebelum dicek."* Ide Stage 1 yang berhenti di situ dapat nilai PIVOT, bukan GO.

Hackathon PayPal lama yang **bukan** lomba ini: PayPal Hack-Chicago (in-person, update pemenang ±7 tahun lalu). https://paypal-hack-chicago.devpost.com/project-gallery — tidak dipakai sebagai formula menang.

Pemenang edisi "PayPal AI Hackathon" sebelumnya: **tidak ketemu**. Besar kemungkinan ini edisi pertama. Jangan dikutip.

Inspirasi resmi (bukan track wajib): https://paypalaihackathon.devpost.com/resources — agent yang benar-benar bertransaksi, agent-to-agent, money movement, business tools, consumer, social impact.

---

## Trade-off tiga arketipe

Marathon biasanya menuntut kedalaman near-production. Sisa waktu solo (±32–48 jam) membuat marathon penuh tidak jujur. Yang diambil dari marathon: **satu alur selesai dan koheren**, bukan lima fitur.

Corporate menuntut PayPal di pusat. Checkout tempel gagal di mata DevRel. Yang diambil: Orders / Invoicing / Payouts / Subscriptions / Disputes / Webhooks sebagai mesin, dipilih **satu** di Stage 1 sesuai ide — belum dikunci sekarang.

Async video adalah pintu semua skor. Rules §5: juri **tidak wajib** menjalankan proyek; mereka boleh menilai dari teks, gambar, dan video saja. Demo tetap wajib agar lolos syarat, tapi video yang membawa bukti transaksi sandbox + AI beraksi.

Trade-off yang diterima: scope dipotong sampai satu killer flow, asalkan flow itu PayPal-nyata, AI-nyata, dan muat diceritakan dalam 3 menit.

---

## Fakta yang diverifikasi (4 Nov 2026)

| Fakta | Nilai | Sumber |
|---|---|---|
| Nama | PayPal AI Hackathon — "Build what's next with PayPal and AI" | https://paypalaihackathon.devpost.com/ |
| Sponsor / admin | PayPal Inc. / Devpost | Rules §2 |
| Format | Online, publik, global, solo atau tim, tanpa track wajib | Overview |
| Submission | 1 Okt 2026 09:15 PT – **12 Nov 2026 12:00 PT** | Rules §1. Overview menulis "12:00pm PST" |
| Setara WIB | **13 Nov 2026, 03:00 WIB** (12:00 PST = 20:00 UTC = 03:00 WIB). 12 Nov 2026 jatuh setelah DST AS berakhir (1 Nov 2026), jadi PST bukan PDT | Konversi dari Rules §1 |
| Judging | 1 Des 2026 14:00 PT – 15 Des 2026 08:00 PT | Rules §1 |
| Pengumuman | Pada atau sekitar 21 Des 2026, 14:00 PT | Rules §1 |
| Peserta | **28.428** saat halaman dibuka | Overview |
| Syarat inti | PayPal (sandbox) **dan** AI, keduanya meaningful; PayPal sentral | Overview + Rules |
| Demo | Hosted URL **atau** instruksi run lengkap. Mockup / statis = gagal | Overview + Rules §5 |
| Repo | Public, open source, LICENSE terlihat di About, GitHub/GitLab/Bitbucket | Rules |
| Video | < 3 menit, YouTube public, proyek berjalan, tanpa musik/trademark pihak ketiga tanpa izin | Rules |
| Bahasa | English, atau sertakan terjemahan English | Sesuai syarat materi; prompt internal |
| Stage One | Lolos/gagal: masuk tema + memakai API/SDK yang diminta | Rules §6 |
| Stage Two | 5 kriteria setara; tie-break = kriteria pertama (Technological Implementation) | Rules §6 |
| Juri boleh tidak menjalankan app | Ya. Boleh nilai dari teks, gambar, video | Rules §5 |
| Stacking | 1 Grand **atau** 1 Honorable, plus 1 Sponsor. Tidak keduanya Grand+Honorable | Rules §8 |
| Cek kelayakan awal | Submit paling lambat **5 Nov** agar tim review menandai masalah; masih bisa diedit sampai deadline | https://paypalaihackathon.devpost.com/updates/47305-two-weeks-to-go-get-your-project-checked-early |
| IP | Tetap milik peserta. Lisensi non-eksklusif ke sponsor untuk penjurian + promosi 3 tahun | Rules §7 |

### Hadiah (Rules §8)

Grand: 1st $12.000 · 2nd $8.000 · 3rd $5.000.  
Honorable (masing-masing $5.000, 1 pemenang): Most Creative, Most Impactful, Best Demo Delivery, Best Use of PayPal + AI, Best Use of Agentic Commerce.  
Sponsor, hanya jika tool-nya dipakai: AG Grid $5.000 / $2.000 / $1.000 · APIMatic $1.000 ×3 + 6 bulan subscription · Bryntum $1.000 ×3 · Channel3 $1.500 · Render credits $1.000 / $750 / $500.

Overview menulis "$67,500 in cash" dan "$69,750 in total prizes". Jumlah baris di Rules §8 yang terbaca = **$65.500 tunai + $2.250 kredit Render**. Selisih $2.000 terhadap headline **belum ketemu** di halaman yang dibaca. Jangan dipakai untuk strategi.

"Agentic Commerce" **tidak didefinisikan** di rules. Inspirasi resmi: agent yang bertransaksi, bukan hanya merekomendasi, termasuk agent-to-agent. Definisi juri tetap [UNVERIFIED].

### Juri tercantum (bisa berubah, Rules §6)

PayPal: Jo Franchetti, Eddie Jaoude, Marco Podien (Developer Advocate); Karthik Ravi (Software Engineer); Himraj Singh (Engineering Manager); Nathaniel Olson (Senior PM).  
Sponsor: Sylwia Vargas (AG Grid), Ameer Hassan (APIMatic), Mats Bryntse (Bryntum), Ignacio Valdez Bicard (Channel3), Carly Richmond (Elastic), Pooja Mistry (Postman), Shifra Williams (Render).

---

## Alokasi effort — kenapa videonya 25%

Lima kriteria sama-sama 20%, jadi satu yang lemah membocorkan seperlima. Technological Implementation dapat prioritas tambahan karena ia tie-break **dan** gerbang Stage One. Presentation dapat prioritas tambahan karena juri tidak wajib menjalankan build: video adalah satu-satunya bukti yang pasti mereka lihat.

Urutan bangun tetap (nanti, setelah PRD): PayPal sandbox end-to-end dulu, loop AI yang menggerakkannya, UI satu alur, deploy + README, baru poles, baru rekam.

Cek awal 5 Nov **tidak dikejar**. Dari malam ini sampai besok tidak cukup untuk proyek yang lolos Stage One tanpa jadi sampah. Submit awal tetap berguna nanti, setelah alur inti jalan — bukan besok.

Kunci materi: **12 Nov 2026, 12:00 WIB**. Sisa sampai 13 Nov 03:00 WIB = buffer, bukan scope baru.

---

## Unknowns — cara menutupnya

| Unknown | Cara cek | Kapan |
|---|---|---|
| Definisi "Agentic Commerce" menurut juri | Tidak ada di rules/FAQ yang terbaca. Tanya di Discord PayPal, atau treat sebagai "agent yang benar-benar create/approve/capture di sandbox" sesuai halaman Resources | Sebelum mengunci ide yang mengejar prize itu |
| Kriteria kualitatif tiap sponsor prize | Rules §8 hanya mensyaratkan "use any [tool]". Tidak ada rubrik tambahan | Jangan mengarang rubrik. Tool sponsor hanya jika memperkuat produk |
| Selisih $67.500 vs $65.500 | Baca ulang blok prize di overview saat submission; tidak mengubah strategi | Opsional |
| Isi gallery peserta lomba ini | https://paypalaihackathon.devpost.com/project-gallery masih kosong | Cek lagi di Stage 1 dan H-2 |
| Apakah proyek "built with PayPal" di atas benar-benar submit ke lomba ini | Buka halaman tiap proyek, lihat hackathon yang dilampirkan | Stage 1, hanya untuk ide yang bertabrakan |
| API mana yang jadi inti | Belum dipilih. Wajib baca docs resmi / `paypal/AI-Toolkit` sebelum kode. Jangan tebak nama endpoint | Setelah GO |

---

## Yang sudah dikunci setelah Stage 1

Ide: **Hire**. API inti: Orders v2 capture $1.200, lalu Payouts $800 setelah `PAYMENT.CAPTURE.COMPLETED`. Sponsor: **Render**. Model: Claude atau Gemini, satu keluaran terstruktur. `.cursor/rules/` sudah dibuat. Detail ada di `docs/prd.md`.
