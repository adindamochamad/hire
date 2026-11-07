# Grok — validasi perbaikan retry webhook payout (salin blok di bawah)

Tempel ke Grok (boleh pakai computer use / shell jika tersedia). **Bahasa laporan: Indonesia.** Kutip string UI/API **English** apa adanya.

```
Kamu verifikator independen untuk aplikasi Hire (PayPal AI Hackathon). Fokus satu klaim saja: masalah retry webhook payout sudah benar-benar selesai di kode dan (setelah deploy) di production — bukan sekadar demo alur sukses sekali jalan.

## Konteks masalah (harus kamu konfirmasi dari bukti, jangan percaya narasi tim)

Di commit lama (~0583a37), handler webhook PayPal menganggap event duplikat = selesai: setelah `INSERT … ON CONFLICT DO NOTHING`, baris yang sudah ada langsung dikembalikan tanpa memproses ulang. Akibatnya, jika payout Maya gagal sementara (mis. HTTP 500 dari API) lalu PayPal mengirim ulang event yang sama, capture sudah tersimpan tetapi payout tidak dipanggil lagi. Uji terisolasi sebelumnya melaporkan 9/10 lulus, satu skenario retry gagal.

Perbaikan yang diklaim tim (commit target: `9027f05` atau lebih baru di `main`):
- Kolom `processed_at` pada `paypal_events` — bedakan “event diterima” vs “pemrosesan selesai”.
- Webhook duplikat: skip hanya jika `processed_at` terisi; jika belum, proses ulang (retry aman).
- Kunci transaksi: `FOR UPDATE` pada baris event dan job; payout hanya jika batch/item belum ada.
- Gagal payout: jangan rollback capture yang sudah valid; event tetap bisa diproses ulang.
- Skrip `npm run test:webhooks` — 13 skenario terhadap PostgreSQL (API PayPal dimock di skrip).

## Sumber yang boleh kamu pakai

- **Live:** https://hire-brjt.onrender.com
- **Repo:** https://github.com/adindamochamad/hire
- **Job contoh settlement lama (opsional, hanya bukti historis):** `hire-b5694488-73ea-42da-941b-21fbc5f10f83`

Jangan minta atau gunakan kredensial buyer sandbox.

## Tugas (urutan wajib)

### A. Repo publik vs deploy

1. Di GitHub, cek **HEAD `main`** (halaman commits atau API): commit perbaikan yang diharapkan memuat message tentang webhook retry dan file `lib/events.ts` + `processed_at` di `sql/schema.sql`. Jika SHA itu tidak ada di `main` → **Blocked (repo)** untuk klaim “fix merged”; jangan campurkan dengan settlement demo job lama.
2. `GET https://hire-brjt.onrender.com/api/health` — catat `ok` dan `sha` **Render**.
3. Repo boleh lebih baru dari live: jika `main` sudah berisi fix tetapi health masih SHA lama (~0583a37) → **FAIL/Blocked untuk production retry**, **PASS conditional untuk kode di GitHub** setelah review + uji lokal.
4. PASS penuh area retry hanya jika **kode di GitHub** lulus B+C **dan** health Render menunjukkan SHA deploy yang sama atau lebih baru dari fix.

### B. Review kode (bukti statis)

4. Baca `lib/events.ts` di `main`: tidak boleh ada early return duplikat yang melewati handler hanya karena insert bentrok; harus ada `processed_at` dan jalur reprocess.
5. Baca `sql/schema.sql`: kolom `processed_at` pada `paypal_events`.
6. Pastikan route `app/api/webhooks/paypal/route.ts` tidak memanggil payout terpisah — payout tetap setelah capture terverifikasi, angka dari DB (`maya_amount`, `client_amount`), `PayPal-Request-Id` / `sender_batch_id` dari id job (cek `lib/paypal.ts`).

### C. Uji perilaku (wajib jika kamu punya shell + Docker Postgres)

7. Clone repo, `npm ci`, `docker compose up -d db`, `DATABASE_URL=postgres://hire:hire@127.0.0.1:5432/hire npm run db:migrate` (atau setara), lalu `npm run test:webhooks`.
8. Laporkan **passed/total**; skenario wajib disebutkan hasilnya:
   - duplikat setelah sukses → tepat satu payout
   - gagal payout sementara lalu event sama → payout dipanggil lagi, batch akhirnya tersimpan
   - dua pemanggilan bersamaan event sama → tepat satu payout
   - amount/currency/order salah, payout tanpa capture, payout amount salah, event `PAYOUTS-ITEM.FAILED`, capture untuk order job lain → tidak boleh status paid (`paypal_payout_item_id` tetap null kecuali skenario valid penuh)

Jika kamu tidak bisa menjalankan uji: bagian C = **Cannot verify** — jangan klaim PASS penuh untuk retry.

### D. Settlement live (regresi, bukan bukti retry)

9. `GET /api/jobs/hire-b5694488-73ea-42da-941b-21fbc5f10f83` — ids capture/payout masih ada? Status masuk akal?
10. Ini **tidak** membuktikan retry; hanya memastikan deploy lama tidak merusak job yang sudah complete.

## Deliverable

Satu laporan dengan:

1. **Verdict** (satu kalimat): untuk area **webhook duplicate + payout retry + exactly-once payout**, pilih **PASS / CONDITIONAL / FAIL**.
2. **Tabel:** Aspek | PASS/FAIL/Blocked | Bukti (URL, SHA, baris file, output command ringkas).
3. **Gap tersisa** (jika ada): mis. live belum SHA baru, signature webhook tidak diuji di skrip Postgres, dll.
4. **Rekomendasi** satu paragraf: apakah klaim “audit pembayaran retry selesai” boleh diterima untuk hackathon.

Gaya skeptis seperti engineer PayPal: tanpa output command atau kutipan kode yang relevan, verdict maksimal **CONDITIONAL**.
```
