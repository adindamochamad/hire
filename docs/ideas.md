# Ideas — Stage 1

*4 Nov 2026, malam WIB. Solo, full-time, mulai dari nol. Kapasitas ±64 jam. Deadline 13 Nov 2026 03:00 WIB.*  
*Kandidat dikunci: Hire. PRD di `docs/prd.md` disetujui 4 Nov 2026 malam. Build belum mulai.*

## Yang dibuang sebelum diskor

| Ide | Verdict | Alasan |
|---|---|---|
| Agent yang menagih dari kalimat, plus tombol PayPal | DROP | Zona median. Sudah terlihat: InvoicePilot, PaidPilot, TakeHome, Morning Assistant. https://devpost.com/software/built-with/paypal |
| Firewall sebelum agent membayar | DROP | Zona median. Agent Payment Firewall, agent-spend-guard, Agent Guardian, VendorTrust, PACT Verify. |
| Shopping agent + katalog Channel3 | DROP | Halaman sponsor mengajak persis ini. https://paypalaihackathon.devpost.com/details/channel3 |
| Dashboard anomaly / "tanya data PayPal" dengan AG Studio | DROP | Contoh resmi AG Grid. https://www.ag-grid.com/blog/hackathon-paypal-and-ag-studio/ |
| Take-home setelah fee PayPal untuk freelancer | DROP | TakeHome sudah ada di gallery tag PayPal, untuk freelancer India. |

Gallery resmi lomba ini masih kosong (4 Nov 2026): https://paypalaihackathon.devpost.com/project-gallery  
Proyek di atas ber-tag PayPal di Devpost. Belum diverifikasi satu per satu apakah mereka submit ke lomba ini. Cukup untuk menjauh dari polanya.

---

## Ide yang dinilai: Delta Clerk

**Nama (mekanisme, masih bisa diganti sebelum PRD):** Delta Clerk  
**The X for Y:** The close-out clerk for machines that bill from a running counter.  
**Insomnia question:** What happens when your agent closes out a machine and bills every hour on the meter, including the hours PayPal already captured?  
**Pengguna:** Pemilik meja sewa alat (satu generator, satu kompresor) yang menyerahkan close-out ke agent. Bukan "semua SMB".

### Cerita demo, satu layar, dua kolom

Kontrak ada di data demo, bukan diketik juri:

- Tarif $80/jam. Batas atas $2.000.
- Tanda terakhir yang sudah di-capture: **1.400,0 jam**.
- Meter sekarang, bergerak di layar: **1.418,0 jam**.
- Yang belum ditagih: 18 jam = **$1.440**.

Pesan yang sama masuk ke kedua kolom: *"Job's done. Charge the customer for 1,418 hours."*

- Kiri, agent polos: mengusulkan tagihan seumur hidup meter, $113.440, dan mencoba membuat order sebesar itu.
- Kanan, Delta Clerk: model boleh mengusulkan angka yang sama. Jumlah yang dikirim ke PayPal dihitung dari selisih pembacaan, **$1.440**. Order membawa rentang 1400→1418. Setelah buyer sandbox approve dan capture selesai, webhook menstempel jam-jam itu sebagai settled.

Detak kedua, pesan yang sama dikirim lagi:

- Kiri mencoba menagih lagi.
- Kanan menolak. Amount $0. Tidak ada order kedua. Capture id yang pertama tetap nempel di jam 1400→1418.

Itu wow moment-nya. Bukan animasi. Angka yang tidak bergerak.

### PayPal dan AI

PayPal adalah mesin close-out, sandbox only.

Yang sudah terverifikasi di dokumen resmi, 4 Nov 2026:

- Orders v2 bisa `intent: CAPTURE` atau `AUTHORIZE`. AUTHORIZE menahan dana; auth berlaku 29 hari. https://developer.paypal.com/api/rest/integration/orders-api/api-use-cases/standard
- Setelah buyer approve lewat link `rel: approve`, capture lewat `POST /v2/checkout/orders/{id}/capture`. https://developer.paypal.com/api/orders/v2/orders-capture
- Webhook yang dipakai sebagai bukti: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`. Nama event ada di https://developer.paypal.com/api/rest/webhooks/event-names dan contoh subscribe di https://developer.paypal.com/payment-methods/webhooks
- Tanda tangan webhook diverifikasi. Secret tidak masuk repo.

Yang **belum** diverifikasi, dan harus ditutup sebelum PRD menguncinya:

- Apakah sandbox Orders v2 bisa capture **sebagian** dari sebuah authorization (plafon $2.000, capture $1.440, sisanya tidak ikut). Kalau tidak bersih, bentuk cadangannya tetap satu cerita: order capture hanya untuk delta $1.440, dan permintaan kedua tidak membuat order. Plafon jadi aturan di ledger, bukan hold PayPal. [UNVERIFIED]

AI tidak menghitung uang. Pembacaan meter dan tarif kontrak yang menghitung. Model hanya membaca pesan close-out, mengusulkan jumlah dan penerima, lalu keputusan itu ditampilkan berdampingan dengan jumlah ledger. Yang dikirim ke PayPal selalu angka ledger. Salahnya model harus kelihatan, bukan disembunyikan.

Guardrail yang terlihat di UI: usulan model vs jumlah capture, rentang jam yang dikunci, id order, event webhook, dan penolakan kedua. Idempotency key = rentang jam yang sudah settled.

### ChatGPT test

Lulus. ChatGPT bisa menjelaskan aturannya. ChatGPT tidak memegang pembacaan, tidak membuat order sandbox, dan tidak menerima webhook yang mengunci jam tersebut.

### Enam pola

| Pola | Pada ide ini |
|---|---|
| Failure mode yang ditakuti | Agent menagih jam yang PayPal sudah capture. Duplikat close-out, bukan "API timeout". |
| Stakes | $113.440 usulan vs $1.440 yang boleh ditagih, pada alat yang sama, di menit yang sama. |
| Side-by-side | Dua kolom, satu pesan, satu meter. |
| Satu pertanyaan | Kalimat insomnia di atas. |
| Buktikan kriteria | Tech: order + approve + capture + webhook live. Design: satu alat close-out, bukan landing. Impact: satu meja sewa, angka kontrak. Innovation: sumber kebenaran adalah counter, bukan PDF. Presentation: dua detak muat di bawah 3 menit. |
| Nama = mekanisme | Delta Clerk = petugas yang hanya menagih selisih. Bisa diganti kalau terasa terlalu dalam. |

### 11 lensa (1–10)

Bobot: Feasibility ×1,5. Competition Fit adalah gerbang, bukan nilai yang menaikkan rata-rata. Lensa dipetakan ke 5 kriteria setara seperti di brief.

Skor di bawah menggantikan skor pertama (rata-rata 7,9). Skor pertama terlalu ramah: ditulis oleh pihak yang mengusulkan ide, lalu dikoreksi pada penilaian juri yang sama malamnya.

| # | Lensa | Skor | Catatan juri |
|---|---|---|---|
| 1 | Pain point | 6 | Niche-nya masuk akal. Demonya tidak membuktikan ada orang yang sakit hari Senin pagi. Meternya disimulasikan. |
| 2 | Differentiation | 5 | Kostum di atas aturan yang sudah ramai: jangan biarkan model menentukan jumlah, dan jangan menagih dua kali. |
| 3 | Feasibility | 8 | Masih yang terkuat. Stack cukup. Bukan alasan untuk menang. |
| 4 | Judge appeal | 4 | Engineer PayPal menganggap idempotency sebagai kerja biasa. Angka $113.440 terasa strawman. |
| 5 | Scalability story | 6 | Sekuelnya ada. Tidak terlihat di demo. |
| 6 | Chance of winning | 3 | Juara 1 sekitar 2% menurut penilaian ini. Lihat bagian di bawah. |
| 7 | Uniqueness | 5 | Meter membantu sepuluh detik pertama. Setelah itu polanya tetap guardrail. |
| 8 | Wow | 5 | Detak kedua adalah penolakan duplikat. Juri pembayaran tidak akan duduk tegak. |
| 9 | ChatGPT test | 6 | Lolos hurufnya. Gagal semangatnya: hapus modelnya, produknya tetap jalan. |
| 10 | Competition fit | 7 | Masih sah dan sempat dibangun. Pemakaian AI berisiko terlihat tempelan. |
| 11 | Ambition ceiling | 6 | Usaha vertical yang kecil. Bukan pintu yang besar. |

Rata-rata kasar: **5,5**. Feasibility yang tinggi tidak menaikkan peluang menang.

### Risiko kompetitif

Peserta lain kemungkinan besar tetap membuat invoice agent dan firewall. Yang berbahaya adalah yang mengambil inspirasi resmi "pay when the job is marked complete" dan menambahkan konfirmasi manusia. Delta Clerk beda selama bukti yang mengunci uang adalah **pembacaan yang sudah punya capture id**, bukan tombol "owner confirms".

### Prize stacking pada ide ini

- Grand 1st.
- Sponsor: Render. Worker menelan tick meter dan webhook; web service yang di-deploy jadi URL juri. Workflow Render hanya kalau ia benar-benar menjalankan close-out. Kalau cuma jadi tempat hosting, kita tidak menulis klaim "best use".
- Agentic Commerce tidak dijadikan target. Agent di sini mengusulkan; yang mengeksekusi adalah clerk. Mengejar label itu akan mendorong kita menambah agent-to-agent yang tidak muat.

### Peluang menang — penilaian juri, 4 Nov 2026 malam

Ini penilaian, bukan statistik. Jumlah submission akhir tidak diketahui. Yang diketahui: 28.428 terdaftar, lima kriteria setara, seri dipecah dari kedalaman PayPal + AI, dan banyak peserta sudah mulai sejak 1 Oktober. Kita mulai 4 November.

| Hasil | Peluang yang saya berani tulis | Kondisi |
|---|---|---|
| Juara 1 | ~2% | Video dan integrasi masuk kelompok terbaik, dan juri setuju masalahnya penting. Saya tidak bertaruh ke sini. |
| Podium (top 3) | ~5% | Butuh sesuatu yang membuat juri PayPal merasa ini milik dunia mereka, bukan demo sewa genset. |
| Salah satu honorable / sponsor | ~10–15% | Paling masuk akal di Best Demo Delivery, dan hanya kalau video-nya lebih tajam dari idenya. |
| Submit rapi, tidak menang apa-apa | ~80% | Hasil yang paling mungkin, termasuk jika build-nya beres. |

Alasan saya tidak memberi angka lebih tinggi:

1. **AI-nya adalah boneka.** Model diarahkan agar salah, lalu ledger yang benar. Kriteria Technological Implementation bertanya seberapa terampil AI dipakai. Jawaban jujurnya: AI bisa dihapus. Itu pemotongan langsung pada kriteria yang juga menjadi tie-break.
2. **Klimaksnya adalah idempotency.** Capture kedua yang $0 adalah perilaku yang engineer PayPal harapkan dari siapa pun yang membaca docs. Bukan momen yang diceritakan besok.
3. **$113.440 mengurangi kredibilitas.** Kesalahan yang menakutkan bagi juri ini adalah $80 atau $160: satu jam terhitung dua kali, pembulatan, atau pesan operator yang selisih 0,5 jam dari meter. Angka kartun mudah ditolak sebagai jerami.
4. **Kita terlambat satu bulan.** Lomba dibuka 1 Oktober. Delapan hari full-time cukup untuk satu alur yang jalan. Tidak cukup untuk terlihat seperti produk yang sudah digosok lima minggu, kecuali idenya lebih tajam dari pesaing yang sudah lebih dulu bangun.
5. **Impact tidak terbukti.** Satu meja sewa fiktif plus MQTT simulator membereskan syarat "audiens spesifik" di atas kertas. Di video, juri melihat prop.

### Verdict

**PIVOT.** Jangan ditulis sebagai PRD dalam bentuk ini. Domain meter boleh tinggal. Yang harus berubah: model mengerjakan keputusan yang ledger tidak bisa kerjakan sendiri, dan kesalahan di demo adalah kesalahan kecil yang tetap lolos kalau model dipercaya.

Bentuk yang akan saya nilai ulang, belum discan ulang: tiga sumber saling berselisih sedikit (meter, pesan operator, dan satu bukti lain). Model memilih jumlah capture dan menuliskan alasannya. Kebijakan hanya memblokir jam yang sudah punya capture id, plus batas atas. Selisih yang terlihat di PayPal adalah puluhan atau ratusan dolar, bukan seratus ribu. Kalau setelah itu AI masih bisa dihapus tanpa mengubah keputusan, tetap PIVOT.

Revisi meter tidak diambil. Counteroffer di bawah sempat jadi kandidat, lalu ditutup karena baunya tetap demo tentang AI. Kandidat yang berlaku ada di bagian Job Sheet.

---

## Ide yang dinilai: Counteroffer

**Nama:** Counteroffer  
**The X for Y:** The dispute desk that answers a PayPal claim with an offer, not a surrender.  
**Insomnia question:** What happens when your agent treats every PayPal dispute as a claim to accept?  
**Pengguna:** Pemilik toko satu orang yang menjual lampu, membuka PayPal malam-malam, dan sudah membiarkan agent membalas sengketa.

Delta Clerk diganti karena objek di layar juri PayPal harus objek PayPal. Di sini objeknya sengketa, dan keputusan model mengubah endpoint yang dipanggil.

### Cerita demo

Satu order sandbox, tiga baris:

- Ceramic shade **$28**
- Brass base **$42**
- Shipping **$16**
- Total **$86**

Agent polos pada kedua kasus melakukan hal yang sama: `POST /v1/customer/disputes/{id}/accept-claim` dengan refund penuh. Sengketa ditutup untuk pembeli. $86 keluar. Itu default yang masuk akal untuk agent yang disuruh "jaga agar pelanggan tidak marah", dan itu mahal.

**Kasus 1.** Pembeli membuka SNAD dan menulis: *"The glass part arrived in pieces. The metal part is fine. I'm not shipping the whole lamp back."*

Counteroffer mengirim `make-offer`, `offer_type: REFUND`, **$28**. Catatan di body mengutip "glass part" dan memetakannya ke Ceramic shade. Base dan shipping tidak ikut. Pembeli sandbox menerima tawaran itu, sehingga uang yang bergerak $28, bukan $86.

**Kasus 2.** Pembeli yang lain, SNAD juga: *"It's all smashed. I'll return it if you refund me. You also charged shipping twice."*

Order hanya punya satu baris shipping. Counteroffer mengirim `make-offer`, `offer_type: REFUND_WITH_RETURN`, **$70** (shade + base), plus alamat retur dari order. Shipping $16 tidak masuk. Catatannya menyebut baris shipping yang hanya satu. Agent polos tetap `accept-claim` $86, dan kalau modelnya patuh pada kalimat "twice", ia bisa mengembalikan shipping yang tidak pernah ditagih dua kali.

Dua jenis tawaran, satu endpoint yang salah di kolom kiri, jumlah yang beda puluhan dolar. Bukan $113.440.

### PayPal yang sudah ada di dokumen

Dicek 4 Nov 2026:

- Buyer sandbox bisa membuat kasus SNAD, tetapi butuh kredensial buyer dan header `PayPal-Auth-Assertion`. https://developer.paypal.com/disputes/test-go-live
- `make-offer` dengan `offer_type: REFUND` bisa untuk kasus INR atau SNAD. `REFUND_WITH_RETURN` ada di langkah uji SNAD dan membutuhkan alamat retur. https://developer.paypal.com/disputes/test-go-live
- `accept-claim` dengan `accept_claim_type: REFUND` menutup sengketa untuk pembeli dan PayPal mengembalikan dana. Dokumen yang sama menyebut notifikasi `CUSTOMER.DISPUTE.RESOLVED` pada jalur ini.
- Setelah tawaran dikirim, buyer bisa `accept-offer`. https://developer.paypal.com/disputes/test-go-live
- Bentuk body `make-offer` (`note`, `offer_amount`, `offer_type`) ada di https://developer.paypal.com/platforms/disputes/integrate-disputes

Yang belum diverifikasi, dan menjadi uji hari pertama, bukan asumsi:

- Akun sandbox baru benar-benar bisa membuat dua sengketa SNAD lalu melihat `make-offer` di link HATEOAS. Dokumen mengatakan begitu. Akun yang belum dibuat belum membuktikannya.
- Nama webhook untuk `make-offer` / `accept-offer` tidak saya kutip. Bukti demo untuk tawaran adalah field tawaran di dispute details, lalu refund setelah buyer menerima. Webhook `CUSTOMER.DISPUTE.RESOLVED` hanya saya andalkan untuk jalur `accept-claim`, karena kalimat dokumen ada di situ.

AI tidak boleh dihapus dari cerita: yang memilih `REFUND` $28 versus `REFUND_WITH_RETURN` $70 versus `accept-claim` $86 adalah bacaan atas kalimat pembeli terhadap baris order. Rumus "selalu tawarkan baris termurah" gagal di kasus 2. Rumus "kalau ada kata return, refund semua" mengembalikan shipping.

Lubang yang saya biarkan terbuka: dengan hanya dua naskah, seorang engineer bisa menyelinap rules engine yang tampak sama di video. Skor ChatGPT test tidak saya naikkan ke 9 karena itu. Yang membuatnya tetap lebih jujur dari Delta Clerk: outputnya adalah aksi PayPal yang berbeda, dan menghapus model berarti tidak ada balasan.

### Enam pola

| Pola | Pada ide ini |
|---|---|
| Failure mode | Agent menerima klaim penuh karena pembeli terdengar yakin, termasuk ongkir yang hanya ditagih sekali. |
| Stakes | $86 keluar, atau $28, atau $70 dengan syarat retur. Selisih yang dipercaya pemilik toko. |
| Side-by-side | Dua kolom, pesan yang sama, endpoint yang berbeda. |
| Satu pertanyaan | Kalimat insomnia di atas. |
| Buktikan kriteria | Tech: sengketa sungguhan, dua call yang berbeda, satu tawaran diterima sampai uangnya bergerak. Design: satu meja sengketa. Impact: satu toko, tiga SKU, satu malam. Innovation: balasan mengikuti kalimat, bukan dropdown alasan. Presentation: dua kasus di bawah 3 menit. |
| Nama | Counteroffer = balasan yang menawar, bukan menyerah. |

### 11 lensa

| # | Lensa | Skor | Catatan juri |
|---|---|---|---|
| 1 | Pain point | 8 | Sengketa PayPal memang yang bikin pedagang kecil tidak tidur. Demonya tetap toko fiktif. |
| 2 | Differentiation | 6 | Kategori "AI jawab chargeback" sudah ada di pasar. Di daftar proyek ber-tag PayPal yang saya lihat 4 Nov, polanya belum sepadat invoice dan firewall. Gallery lomba ini sendiri masih kosong, jadi keramaian peserta belum terbukti. |
| 3 | Feasibility | 6 | Lebih rapuh dari Delta Clerk. Setup buyer sandbox bisa memakan hari pertama. Dua kasus, bukan lima. |
| 4 | Judge appeal | 8 | Yang ada di layar adalah sengketa, `make-offer`, dan `accept-claim`. DevRel kenal benda ini. |
| 5 | Scalability story | 6 | Lanjutannya alasan sengketa lain. Bukan perusahaan baru yang jelas. |
| 6 | Chance of winning | 5 | Angka ada di bawah. Naik dari 3, tidak menjadi favorit. |
| 7 | Uniqueness | 6 | Yang diingat adalah dua jenis tawaran dari dua kalimat, bukan kategori produknya. |
| 8 | Wow | 7 | $86 versus $28 pada order yang sama, lalu kasus kedua menolak ongkir ganda yang tidak ada. |
| 9 | ChatGPT test | 7 | Lolos lebih baik dari Delta Clerk. Dua naskah tetap bisa dipalsukan aturan. |
| 10 | Competition fit | 8 | Gerbang lolos kalau sengketa sandbox hidup di hari pertama. Kalau tidak, gerbang ini gagal. |
| 11 | Ambition ceiling | 6 | Meja balasan untuk satu toko. |

Rata-rata kasar: **6,6**. Feasibility yang lebih rendah adalah harga dari peluang yang lebih tinggi. Tidak saya rata-ratakan supaya terlihat aman.

### Peluang menang

Penilaian, bukan data. Bersarang: juara termasuk podium, podium termasuk "ada hadiah".

| Hasil | Delta Clerk | Counteroffer | Kenapa bergerak |
|---|---|---|---|
| Juara 1 | ~2% | **~6%** | Artefaknya produk PayPal, dan AI memilih call-nya. Masih kalah dari tim yang sudah bangun sejak 1 Oktober dengan eksekusi setara. |
| Podium | ~5% | **~12%** | Tie-break (kedalaman PayPal + AI) adalah tempat ide ini lebih kuat. |
| Ada hadiah | ~10–15% | **~22%** | Termasuk Best Demo kalau videonya hanya dua kasus itu dan tidak ada slide. |
| Tidak menang | ~80% | **~78%** | Hasil yang paling mungkin tetap ini. |

Saya tidak menulis 15% untuk juara 1. Itu akan mengulang kesalahan skor 7,9.

Yang menahan angkanya:

1. **Rules engine bisa meniru video.** Dua kalimat yang sudah dihafal bukan bukti modelnya umum. PRD nanti harus memasukkan satu kalimat cadangan dengan kata berbeda yang menghasilkan keputusan yang sama, dan kalimat itu ikut direkam. Kalau tidak, skor innovation saya turunkan lagi saat build.
2. **Sandbox sengketa adalah risiko jadwal, bukan risiko cerita.** Butuh order yang sudah dibayar, buyer assertion, lalu link HATEOAS yang benar-benar berisi `make-offer`. Kalau hari kedua ini macet, Counteroffer dihentikan. Jangan diganti mock.
3. **Kita tetap mulai tanggal 4 November.** Ide yang lebih tepat tidak menambah minggu yang sudah dipakai peserta lain.
4. **Impact tetap satu toko yang kita karang.** Lebih dipercaya daripada meter MQTT, karena sengketa $86 adalah benda yang juri sudah lihat. Tetap bukan pelanggan nyata.

### Prize stacking

Tidak berubah. Grand 1st. Render untuk URL dan worker yang menarik sengketa lalu mengirim balasan. Tidak ada klaim "best use" kalau Render hanya menjadi host. Agentic Commerce tidak dikejar: yang bertransaksi adalah balasan merchant, bukan dua agent yang saling bayar.

### Verdict

**DROP.** Ditutup 4 Nov 2026 malam, setelah kamu menunjukkan baunya masih demo AI. Peluangnya tidak cukup untuk menanggung cerita yang harus dijelaskan dulu.

---

## Ide yang dinilai: Job Sheet

Produk biasa. Studio dua orang mengerjakan satu job. Klien ditagih. Rekan dibayar bagiannya setelah uang klien masuk. Tidak ada agent bodoh, tidak ada kolom pembanding, tidak ada pertanyaan jebakan.

**Nama:** Job Sheet  
**Pengguna:** Studio kecil yang menagih klien lewat PayPal dan punya satu rekan yang harus kebagian.  
**Kalimatnya:** Client pays the invoice. The person who did the work gets their share.

### Yang terjadi di demo

Catatan job, ditulis seperti catatan sungguhan, bukan teka-teki:

> Landing page, two rounds of revision. $1,200. Maya did the UI, she gets half. Due Friday.

Model mengisi draf: satu invoice $1.200 ke klien, satu bagian $600 untuk Maya. Orang di studio mengoreksi kalau perlu, lalu menekan kirim. Yang terkirim adalah invoice PayPal, bukan kalimat model.

Klien sandbox membayar invoice itu. Webhook `INVOICING.INVOICE.PAID` masuk. Baru setelah itu payout $600 dibuat ke Maya. Webhook `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` menempel di job yang sama. Sebelum invoice lunas, tombol bayar rekan tidak mengirim apa-apa.

AI-nya ada di pekerjaan yang memang menyebalkan: mengubah catatan jadi baris tagihan dan bagian rekan. Uang tidak bergerak sebelum orangnya setuju, dan bagian rekan tidak bergerak sebelum klien membayar. Itu aturan usaha, bukan klimaks cerita.

### PayPal

Sudah ada di dokumen resmi:

- Invoice: buat draf, kirim, status jadi belum dibayar. https://developer.paypal.com/api/invoicing
- `INVOICING.INVOICE.PAID` saat invoice dibayar, termasuk sebagian atau masih pending. Jangan dianggap lunas penuh sebelum isi event-nya dibaca. https://developer.paypal.com/api/rest/webhooks/event-names/
- `INVOICING.INVOICE.SENT` ada di https://developer.paypal.com/api/invoicing/webhooks
- Payout butuh akun bisnis sandbox yang ada dananya. https://developer.paypal.com/api/payouts
- `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` saat satu penerima benar-benar terbayar. https://developer.paypal.com/api/rest/webhooks/event-names/

Belum diverifikasi di akun kita: apakah invoice sandbox bisa dilunasi oleh buyer personal dalam satu duduk, lalu payout ke akun personal kedua langsung menyusul. Itu uji hari pertama.

### Kenapa ini kurang bau AI

Lomba mewajibkan AI dipakai. Lomba tidak mewajibkan produknya berupa kisah tentang AI. Dua ide sebelumnya mengejar pola "pertanyaan insomnia" dan "agent yang salah". Pola itu yang baunya tercium. Job Sheet lolos syarat karena modelnya mengerjakan draf, dan lolos hidung karena yang dijual adalah tagihan dan bagian rekan.

### 11 lensa

| # | Lensa | Skor | Catatan |
|---|---|---|---|
| 1 | Pain | 8 | Menagih klien lalu membagi ke rekan adalah kerja yang sudah ada. |
| 2 | Differentiation | 5 | Invoice-dari-kalimat sudah ramai. Yang membedakan hanya kaki keduanya: payout setelah lunas. |
| 3 | Feasibility | 8 | Dua API yang dokumentasinya jelas. Lebih mudah dari sengketa. |
| 4 | Judge appeal | 7 | Juri mengenali invoice dan payout. Sebagian akan mengira ini clone di detik ke-10. |
| 5 | Scalability | 6 | Job berikutnya, rekan kedua. Bukan visi besar. |
| 6 | Chance of winning | 5 | Juara 1 tidak naik. Hadiah khusus sedikit lebih masuk akal. Angka di bawah. |
| 7 | Uniqueness | 4 | Sengaja umum. Kriteria Innovation membayar harga ini. |
| 8 | Wow | 5 | Tidak ada kejutan. Yang ada adalah job yang selesai sampai uangnya terbagi. |
| 9 | ChatGPT test | 6 | Model bisa dihapus dan orang mengetik sendiri. Produknya jadi lebih lambat, bukan rusak. Untuk lomba ini itu cukup, asal drafnya terlihat dipakai. |
| 10 | Competition fit | 8 | PayPal ada di kedua uangnya. AI terlihat di draf. Muat 8 hari. |
| 11 | Ambition | 5 | Alat studio. Bukan pintu baru. |

Rata-rata kasar: **6,1**. Lebih rendah dari Counteroffer. Saya tidak menaikkannya agar terasa lebih menang.

### Peluang

| Hasil | Counteroffer | Job Sheet | Yang berubah |
|---|---|---|---|
| Juara 1 | ~6% | **~5%** | Innovation 20% menghukum produk yang umum, dan jalan invoice sudah ramai. |
| Podium | ~12% | **~10%** | Tie-break tetap kedalaman teknis. Invoice plus payout cukup, tidak spektakuler. |
| Ada hadiah | ~22% | **~25%** | Design, Impact, dan Presentation lebih mudah dipercaya kalau yang direkam adalah kerja biasa yang selesai. |
| Tidak menang | ~78% | **~75%** | Masih hasil yang paling mungkin. |

Tidak ada versi "lebih umum" yang jujur saya beri peluang juara di atas ini. Yang lebih umum lagi dari Job Sheet adalah tombol checkout atau chatbot invoice. Peluangnya lebih kecil, karena itu median yang sudah terlihat di https://devpost.com/software/built-with/paypal (InvoicePilot, PaidPilot, TakeHome, Invoice Cash Agent).

### Verdict

**GO bersyarat**, sebagai produk, bukan sebagai konsep. PRD setelah kamu setuju. Hari pertama hanya invoice terkirim, dibayar di sandbox, webhook masuk, lalu satu payout. Kalau payout sandbox tidak bisa didanai, ide ini turun menjadi invoice saja, dan peluang juara 1 saya turunkan ke ~3% karena saat itu ia masuk kerumunan.

---

Job Sheet tidak dilanjutkan. Kamu minta peluangnya ikut naik. ~5% juara 1 tidak memenuhi itu.

---

## Ide yang dinilai: Hire

Produk yang sudah dikenal: klien menyewa pembuat, membayar sekali, pembuat menerima bagiannya. Bukan kisah tentang agent yang hampir salah.

**Nama:** Hire  
**Pengguna:** Studio kecil dengan satu klien dan satu rekan (Maya).  
**Kalimatnya:** The client pays for the job. Maya receives her share.

### Demo, tanpa kolom pembanding

Percakapan biasa.

- Klien: butuh landing page, dua kali revisi.
- Maya: saya kerjakan, bagian saya $800.
- Studio menulis harga klien $1.200.

Asisten studio menyusun perjanjian dari obrolan itu: klien membayar **$1.200**, Maya menerima **$800**, studio menyimpan **$400**. Keduanya menekan setuju pada angka yang sama. Asisten lalu membuat order PayPal sebesar $1.200. Klien menyetujui di layar PayPal sandbox, bukan di tombol palsu. Setelah capture, payout **$800** terkirim ke akun Maya. Job menampilkan tiga angka itu, plus dua event: `PAYMENT.CAPTURE.COMPLETED` dan `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`.

Layar PayPal adalah persetujuannya. Tidak ada adegan "agent nakal". Asisten hanya menyusun perjanjian dan memanggil PayPal. Itu pekerjaan koordinator studio.

### Kenapa angkanya naik

Halaman inspirasi lomba memang meminta ini, dengan kata mereka: asisten yang membayar kontraktor ketika pekerjaan selesai, dan checkout yang membagi uang antara platform dan penjual. https://paypalaihackathon.devpost.com/resources

Hire memakai permintaan itu sebagai produk biasa, dengan dua pergerakan uang yang bisa dilihat di akun sandbox. Job Sheet hanya terasa seperti pembuat invoice. Counteroffer terasa seperti lakon. Keduanya sudah ditutup.

`platform_fees` tidak dipakai. Di sandbox biaya partner tidak muncul di saldo, jadi juri tidak bisa melihatnya. https://developer.paypal.com/platforms/overview dan catatan implementasi yang sama di https://stackoverflow.com/questions/68846821/paypal-commerce-platform-where-does-the-platform-fee-go . Bagian studio adalah sisa saldo setelah payout, bukan fee yang hilang.

### PayPal

- Order dibuat, klien approve, lalu capture. https://developer.paypal.com/api/rest/integration/orders-api/api-use-cases/standard
- `PAYMENT.CAPTURE.COMPLETED` ada di daftar event. https://developer.paypal.com/api/rest/webhooks/event-names/
- Payout $800 ke Maya setelah capture. Akun bisnis sandbox harus ada dananya. https://developer.paypal.com/api/payouts
- `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` untuk bukti bagian Maya. Sumber yang sama.

Uji hari pertama: satu capture $1.200 dan satu payout $800 yang statusnya sukses. Kalau payout tidak bisa didanai, Hire berhenti. Jangan diganti teks "Maya telah dibayar".

### 11 lensa

| # | Lensa | Skor | Catatan |
|---|---|---|---|
| 1 | Pain | 8 | Menyewa orang dan membagi bayarannya adalah kerja yang sudah ada. |
| 2 | Differentiation | 6 | Jalurnya diundang resmi, jadi tidak langka. Yang beda adalah harga klien, bagian rekan, dan sisa studio pada satu job. |
| 3 | Feasibility | 7 | Order plus payout adalah jalur yang dokumentasinya matang. Payout tetap bisa gagal di hari pertama. |
| 4 | Judge appeal | 8 | Ini kalimat di halaman inspirasi mereka, dikerjakan sampai uangnya terlihat. |
| 5 | Scalability | 6 | Rekan kedua, job kedua. |
| 6 | Chance of winning | 6 | Juara 1 ~9%. Naik dari angka yang terakhir saya tulis. Bukan favorit. |
| 7 | Uniqueness | 5 | Umum dengan sengaja. Cukup berbeda dari chatbot invoice karena ada dua penerima. |
| 8 | Wow | 6 | Tidak ada kejutan. Tiga angka yang cocok dengan layar PayPal. |
| 9 | ChatGPT test | 7 | Model menyusun perjanjian dan membuat order. Orang tetap menyetujui di PayPal. Itu cara produk ini memang dipakai. |
| 10 | Competition fit | 8 | PayPal di kedua arah uang. AI terlihat karena dialah yang menulis order dari obrolan. |
| 11 | Ambition | 6 | Meja sewa untuk studio. Sekuelnya banyak rekan, bukan jaringan baru. |

Rata-rata kasar: **6,6**.

### Peluang

| Hasil | Job Sheet | Hire |
|---|---|---|
| Juara 1 | ~5% | **~9%** |
| Podium | ~10% | **~15%** |
| Ada hadiah | ~25% | **~32%** |
| Tidak menang | ~75% | **~68%** |

~9% adalah plafon yang saya percaya untuk mulai tanggal 4 November. Saya tidak menulis 12%. Yang menahannya: contoh resmi ini akan dikerjakan orang lain juga, payout bisa macet, dan peserta yang mulai 1 Oktober punya lebih banyak waktu untuk menggosok video.

Kalau UI-nya berubah jadi dua chatbot yang berdebat, peluang juara 1 kembali ke ~5%.

### Verdict

**GO bersyarat.** Ini yang peluangnya naik tanpa kembali menjadi lakon AI.

PRD setelah kamu setuju. Isi PRD satu job, dua orang, satu capture, satu payout.

---

## Disepakati

PRD di `docs/prd.md` disetujui 4 Nov 2026 malam. Build belum mulai.
