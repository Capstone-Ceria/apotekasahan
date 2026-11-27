# Asumsi & Pertanyaan Terbuka — Logika Bisnis Backend (Dio)

Disusun 27 November 2026. Kode logika bisnis sudah dibuat di `backend/src/bisnis/` **tanpa menunggu** kesepakatan final, dengan acuan `docs/02-Desain-Database.md` v1.0, `docs/03-API-Contract.md` v1.1, `docs/05-Rencana-Pengujian.md`, dan `docs/TRIAGE_12_KOMENTAR.md`.

Semua angka yang masih asumsi ada di **satu file**: `backend/src/bisnis/config/default.js` (kode `[A-xx]` di bawah sama dengan komentar di file itu). Kalau jawaban berbeda dari asumsi, biasanya cukup ubah satu nilai di sana; tes otomatis (`npm test`, 52 tes) langsung menunjukkan apa yang terdampak.

Status: ⏳ = menunggu jawaban, ✅ = sudah jelas dari dokumen tim (tinggal dikonfirmasi).

---

## A. Untuk Charlene (fondasi backend)

| Kode | Asumsi yang dipakai sekarang | Kalau ternyata beda, yang diubah |
| --- | --- | --- |
| A-20 ⏳ | **Klien HTTP ke FastAPI** sudah saya tulis (`adapters/prediksi/index.js`: timeout 5 dtk, header `X-Internal-Secret`, catat ke `riwayat_inferensi`, fallback "Skor belum tersedia"). Usul: Charlene cukup memakai ini, atau menggantinya dengan klien sendiri yang punya method `prediksi(fitur)`. | Hanya adapter. Service tidak berubah. |
| A-21 ⏳ | **Titik sambung simpan batch**: endpoint `POST /faktur/simpan-batch` milik Charlene memanggil `bisnis.batchMasuk.siapkan(...)` sebelum INSERT (validasi + hitung `nilai_total`, `batas_retur`, `status_retur`), lalu `bisnis.batchMasuk.setelahTersimpan(ids)` setelah COMMIT (hitung skor). | Cara panggil saja. |
| A-24 ⏳ | **Middleware auth**: router saya menerima `auth: { wajibLogin, wajibAdmin }` dari Charlene. Default-nya hanya mengecek `req.user.role` (diasumsikan diisi middleware JWT). | Satu baris saat mount router. |
| — ⏳ | **Struktur folder**: semua kode saya ada di `backend/src/bisnis/` (domain, services, repositories, adapters, http, config). Kerangka `backend/` lain (app.js, auth, db, migration) belum ada dan tetap bagian Charlene. `backend/package.json` saya buat minimal; silakan digabung/ditimpa. | Pindah folder saja; import antarfile di dalam `bisnis/` relatif. |
| — ⏳ | **Akses DB**: semua SQL ada di `repositories/postgres.js` (raw `pg`, sesuai DDL v1.0, **belum diuji ke Neon**). Kalau Charlene pakai ORM lain, buat implementasi baru dengan method di `repositories/KONTRAK.md`. | Hanya folder `repositories/`. |
| — ✅ | **Format respons** mengikuti kontrak API §1.2: `{ sukses, pesan, data, meta }` dan error `{ sukses:false, pesan, error_kode, detail }`. | — |
| A-15 ⏳ | **Nilai `status_retur`**: saya pakai `bisa_diretur`, `lewat_batas`, `tidak_bisa_diretur` (aturan 0), `sudah_diretur`, `dibuang` (sesuai frontend & triage). Dokumen DB menyebut `belum_diretur` dan tidak punya `tidak_bisa_diretur`/`dibuang`. Kolomnya VARCHAR tanpa CHECK, jadi tetap jalan. Mohon dikunci di migration. | Konstanta `STATUS_RETUR` di `domain/retur.js`. |
| — ⏳ | **`status_risiko` saat skor belum ada** saya isi `'belum_tersedia'` (kontrak API), bukan NULL (dokumen DB). `keterangan` = "Skor belum tersedia". | `domain/risiko.js`. |
| — ⏳ | **`status_retur` disimpan di DB sebagai cache**, tapi semua menu menghitung ulang dari `batas_retur` + tanggal acuan saat dibaca. Saat tanggal acuan / aturan retur berubah, kolom di DB ikut disegarkan. | — |
| — ⏳ | **Endpoint yang saya isi**: `GET/PUT /pengaturan`, `GET /pengaturan/aturan-retur`, `PUT /pengaturan/aturan-retur/:id`, `GET /pengingat`, `GET /pengingat/notifikasi`, `POST /penyesuaian-stok`, `GET /batches/:id/penyesuaian`, `GET /batches`, `GET /batches/:id`, `GET /dashboard/ringkasan`, plus usulan `POST /risiko/hitung-ulang`. `GET /batches` bisa bentrok dengan modul batch Charlene; mohon diputuskan siapa yang memegang. | Hapus route yang tidak dipakai di `http/router.js`. |
| — ⏳ | **Belum dibuat (butuh perubahan skema dulu)**: catat retur (`POST /retur`), catat dibuang, prioritas jual (triage #7–#9), opname massal (`/penyesuaian-stok/massal`). Perlu tabel log retur/pembuangan dan kolom `prioritas_jual`. Sesuai plan, perubahan skema diumumkan dulu. | — |
| — ⏳ | **Env baru** (untuk `.env.example`, tanpa nilai rahasia): `PREDIKSI_MODE` (`http`/`stub`/`mati`), `PREDIKSI_URL`, `PREDIKSI_SECRET`, `PREDIKSI_TIMEOUT_MS`. | — |

## B. Untuk PIC / Bu Anni (lewat penghubung UMKM)

| Kode | Asumsi | Sumber |
| --- | --- | --- |
| A-02 ✅ | Batas retur = **tanggal kedaluwarsa dikurangi N bulan** (bukan N bulan sejak diterima). | docs/02 §3.3 |
| A-03 ⏳ | Distributor yang belum punya aturan dianggap **6 bulan**. | docs/02 §3.3 ("default 6 bulan") |
| A-04 ⏳ | Pilihan aturan hanya **0, 1, 3, 6 bulan** (0 = tidak terima retur). Kalau ada distributor 2/12 bulan, tinggal ditambah. | docs/02 §3.3 |
| A-05 ⏳ | Pada **hari H** batas retur obat **masih bisa** diretur; mulai H+1 "Lewat Batas Retur". Kalau tanggal hasil pengurangan tidak ada (31 Mar − 1 bln) dipakai tanggal terakhir bulan itu (28/29 Feb). | Asumsi tim |
| A-11 ⏳ | **Stok menipis dihitung per batch** (`0 < stok ≤ stok_minimum obat`), mengikuti frontend & triage #11. Dokumen DB menulis per obat (total semua batch). Mode `per_obat` juga sudah tersedia, tinggal ganti satu nilai. | Konflik docs/02 §3.4 vs triage #11 |
| A-19 ⏳ | Obat yang **ED-nya hari ini** dianggap sudah kedaluwarsa. | Asumsi tim |
| A-01 ✅ | Tanggal acuan default **31 Okt 2026**, bisa diubah admin, dipakai seragam di pengingat, tabel, dashboard. | Project plan |

## C. Untuk Fachri & Umar (model risiko & angka dashboard)

| Kode | Asumsi | Yang perlu dikonfirmasi |
| --- | --- | --- |
| A-16 ⏳ | **Fitur input model** persis seperti contoh kontrak §9.1: `batch_id, distributor_id, jumlah_awal, jumlah_saat_ini, harga_beli_satuan, sisa_hari_ke_kedaluwarsa, sisa_hari_ke_batas_retur, aturan_retur_bulan, rasio_stok_tersisa`. | Apakah ini sama dengan fitur saat model dilatih? Ada `kategori` obat? Satuan harga? |
| A-17 ⏳ | Untuk distributor aturan 0, `sisa_hari_ke_batas_retur` dikirim **null**. | Model menerima null, atau maunya angka tertentu (mis. -1)? |
| A-09 ⏳ | Fitur dihitung **relatif ke tanggal acuan**, jadi skor dihitung ulang (di latar, 5 paralel) saat tanggal acuan atau aturan retur berubah. | Benar relatif ke tanggal acuan? Ada endpoint batch (banyak sekaligus) supaya 1.400 batch tidak dipanggil satu-satu? |
| A-06 ⏳ | Label risiko: **tinggi ≥ 0,75, sedang ≥ 0,50, rendah < 0,50**. | Ambang hasil kalibrasi model? |
| A-07 ⏳ | Kalau FastAPI mengembalikan `kategori_risiko`, label itu yang dipakai; kalau tidak ada, pakai ambang A-06. | Mana yang jadi sumber kebenaran? |
| A-10 ⏳ | URL `POST {PREDIKSI_URL}/predict-risk`, header `X-Internal-Secret`, timeout 5 detik, satu batch per request. | Timeout wajar di Render free tier (cold start bisa > 30 dtk)? |
| A-08 ⏳ | Kalau prediksi gagal setelah stok berubah, skor lama **dikosongkan** jadi "belum tersedia" (bukan dipertahankan). | — |
| A-23 ⏳ | Batch yang stoknya jadi 0 tidak dikirim ke model. | — |
| A-13 ⏳ | **Batch berisiko** di dashboard = `status_risiko = tinggi` **atau** sudah lewat batas retur. Nilai berisiko = Σ(jumlah_saat_ini × harga_beli_satuan) batch tersebut. | Umar: apakah sama dengan definisi di analisis? |
| — ✅ | **Nilai persediaan** = jumlah_saat_ini × harga_beli_satuan, dihitung dalam satuan sen supaya tabel & dashboard sama persis (TC-DSH-001). | Umar: cocokkan dengan hitungan manual. |

## D. Untuk Nugroho (bentuk respons)

- A-18: Sesuai triage #12, batch "lewat batas" tidak pernah tampil "Risiko Tinggi". Saya **tidak mengubah** nilai dari model; respons membawa dua field: `status_risiko` (asli) dan `status_risiko_tampil` (untuk badge). Filter `status_risiko` di `GET /batches` memakai label tampil.
- `GET /pengingat` mengembalikan `daftar_item` (datar, urut tenggat, sesuai kontrak §5.1) **dan** `daftar.{bisa_diretur, mendesak_retur, lewat_batas_retur, mendekati_kedaluwarsa, stok_menipis}` (snake_case, mengganti `bisaDiretur`, dst. di mock frontend). Item lewat batas membawa `aksi_disarankan`: `prioritas_jual` / `catat_dibuang`.
- `GET /dashboard/ringkasan` mengikuti nama field kontrak §7.1 (`jumlah_batch_berisiko_tinggi`, `total_nilai_berisiko_hangus`, `distributor_berisiko_terbanyak`), bukan nama di `mockData`/`api.js` (`jumlah_batch_berisiko`, `distributor_terancam`).
- `GET /pengingat/notifikasi` meniru `getHeaderNotifications()` (id, type, tone, title, detail, targetPage).
- A-12: urgensi `kritis` bila sisa ≤ 15 hari (retur) / ≤ 30 hari (ED), sama dengan frontend.
- A-22: validasi "tanggal kedaluwarsa tidak boleh lampau" (TC-INP-007) memakai **tanggal acuan** sebagai "hari ini", supaya konsisten dengan data simulasi.
- A-14: batch yang sudah diretur/dibuang ditolak saat penyesuaian stok (422 `ERR_BATCH_TIDAK_AKTIF`).
- `POST /penyesuaian-stok` membalas **200** (sesuai contoh §6.1), walau tabel kode status §1.3 menyebut 201.

---

## Cara mencoba

```bash
cd backend
npm install
npm test               # 52 tes, tanpa database
npm run dev:bisnis     # server coba di http://localhost:3001/api/v1, data memori + prediksi stub
# Header pengganti login sementara:  X-Peran: admin   atau   X-Peran: karyawan
```
