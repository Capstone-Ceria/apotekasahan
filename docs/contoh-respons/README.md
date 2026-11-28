# Contoh Respons Aktual `backend/src/bisnis/`

Dokumen ini mendokumentasikan contoh respons nyata (**sukses** dan **error**) dari seluruh endpoint pada [`backend/src/bisnis/http/router.js`](../../backend/src/bisnis/http/router.js) (12 endpoint) serta fungsi layanan non-router [`backend/src/bisnis/services/batchMasuk.js`](../../backend/src/bisnis/services/batchMasuk.js) yang dijalankan langsung memakai data dummy [`backend/test-support/fixture.js`](../../backend/test-support/fixture.js) (`dataAwal()`, `tanggal_acuan = 2026-10-31`, repository memori, klien prediksi `stub` dan `mati` untuk skenario fallback).

> **Catatan cakupan:** Tidak ada file di `frontend/` maupun `backend/` yang diubah saat menghasilkan dokumentasi ini. Seluruh `body` pada berkas `.json` di folder ini adalah keluaran langsung dari eksekusi Express + `supertest` dan `buatBisnis(...)`.

---

## Legenda Penandaan Perbedaan

| Penanda | Arti |
| --- | --- |
| `✅ Sama` | Nama, tipe, dan letak field konsisten dengan kontrak API (`docs/03-API-Contract.md` v1.1) dan pemakaian frontend (`frontend/src/services/api.js` & `pages/*.jsx`). |
| `⚠️ Beda Kontrak API` | Berbeda nama, tipe, kode status, atau merupakan tambahan dibanding `docs/03-API-Contract.md`. |
| `⚠️ Beda Frontend` | Berbeda nama, struktur (datar vs bersarang), wrapper, atau konvensi kasus huruf (`snake_case` vs `camelCase`) dibanding yang dipakai `frontend/src/services/api.js` / halaman UI saat ini. |
| `🆕 Tambahan Backend` | Endpoint, fungsi, atau field baru di `backend/src/bisnis/` yang belum tercantum di kontrak API maupun belum dipakai frontend. |

---

## Ringkasan Data Dummy (`dataAwal()`)

- **Pengaturan awal:** `tanggal_acuan = "2026-10-31"`, `stok_minimum_default = 10`, `batas_kedaluwarsa_warning_hari = 90`, `batas_retur_warning_hari = 30`.
- **Distributor:** `D1` (6 bln), `D2` (3 bln), `D3` (0 bln / konsinyasi), `D4` (belum ada aturan → default 6 bln).
- **Batch:**
  - `#1` (`A-MENDESAK`): D2 (3 bln), ED `2027-02-15`, batas retur `2026-11-15` (15 hari lagi → mendesak retur), stok `20`, harga `1500.10`.
  - `#2` (`A-LEWAT`): D1 (6 bln), ED `2027-02-20`, batas retur `2026-08-20` (lewat batas), stok `12`, skor `0.9` (`tinggi` → tampil `sedang`).
  - `#3` (`P-KONS`): D3 (0 bln), ED `2026-11-20` (20 hari lagi → dekat ED), `batas_retur: null`, stok `8`.
  - `#4` (`P-TIPIS`): D1 (6 bln), ED `2027-12-01`, batas retur `2027-06-01`, stok `3` (≤ minimum `5` → stok menipis), skor `0.2` (`rendah`).
  - `#5` (`A-RETUR`): stok `0`, `status_retur: "sudah_diretur"` (nonaktif, tidak tampil di daftar aktif/pengingat).
  - `#6` (`A-DEFAULT`): D4 (tanpa aturan → 6 bln), ED `2027-10-01`, batas retur `2027-04-01`, stok `50`, harga `0.10`.

---

## Ringkasan Cepat Perbedaan Kritis (Checklist Integrasi)

| Area | Implementasi `backend/src/bisnis/` | Kontrak API (`docs/03-API-Contract.md`) | Frontend (`frontend/src/services/api.js` & `pages/*.jsx`) |
| --- | --- | --- | --- |
| **Wrapper respons** | Selalu `{ sukses, pesan, data, ...extra }` | Sama (§1.2) | Beberapa method (`getSettings`, `getDistributors`, `getHeaderNotifications`, `getRiwayatPenyesuaian`) mengembalikan data **langsung** tanpa wrapper `{ sukses, pesan, data }`. |
| **Struktur item batch (`GET /batches`)** | Bersarang: `obat: { id, kode_obat, nama_obat, kategori, satuan, stok_minimum }` & `distributor: { id, kode, nama, telepon, aturan_retur_bulan }`, ditambah `status_risiko_tampil`, `sisa_hari_*`, `sudah_kedaluwarsa`, `aktif`, `keterangan` | Bersarang (§4.1), tetapi tanpa `obat.kategori`, `distributor.kode/telepon`, `status_risiko_tampil`, `sisa_hari_*`, `sudah_kedaluwarsa`, `aktif`, `keterangan` | **Datar**: `obat_id`, `nama_obat`, `distributor_id`, `nama_distributor` di root item; `tanggal_acuan` di root respons (bukan di `meta`); tanpa paginasi `meta`. |
| **Nilai `status_retur` & `status_risiko`** | `bisa_diretur`, `lewat_batas`, `tidak_bisa_diretur`, `sudah_diretur`, `dibuang`; memisahkan `status_risiko` (asli model) dan `status_risiko_tampil` (`tinggi` + `lewat_batas` → `sedang`, `[A-18]`) | §4.1 menyebut `belum_diretur`, tidak punya `tidak_bisa_diretur`/`dibuang`, tidak punya `status_risiko_tampil` | Memakai 5 status retur yang sama, tetapi menimpa langsung `status_risiko` menjadi `'sedang'` saat `lewat_batas` (tidak ada `status_risiko_tampil`). |
| **`GET /pengingat`** | Semua berada di dalam `data`: `tanggal_acuan_sistem`, `total_pengingat`, `ringkasan` (5 kunci tanpa prefix `total_`), `daftar` (`snake_case`: `bisa_diretur`, dst.), dan `daftar_item` (datar) | §5.1 tidak punya `daftar` terkelompok, `ringkasan` hanya 3 kunci, `tipe` tidak punya `lewat_batas`, field item lebih sedikit | `tanggal_acuan` & `ringkasan` (prefix `total_*`) di **root**; `data` memakai `camelCase` (`bisaDiretur`, `mendesakRetur`, `lewatBatasRetur`, `mendekatiKedaluwarsa`, `stokMenipis`); item memakai `id`, `nama_distributor`, `jumlah_saat_ini`, `nilai_total` (bukan `batch_id`, `distributor`, `sisa_stok`, `nilai_stok`); tidak memakai `daftar_item`. |
| **`GET /dashboard/ringkasan`** | Mengikuti kontrak §7.1 + tambahan `ringkasan_pengingat` | Sama dengan §7.1 kecuali tambahan `ringkasan_pengingat` | Nama field berbeda: `jumlah_batch_berisiko`, `total_nilai_berisiko`, `persentase_berisiko` (string `.toFixed(1)`), `distributor_terancam` (`nama`, `nilai`, `batch_count`, maks 4); tanpa `tindakan_segera` & `ringkasan_pengingat`. |
| **`POST /penyesuaian-stok`** | Status HTTP `200`, mengembalikan ringkasan datar (`batch_id`, `jumlah_sebelum`, `jumlah_sesudah`, `selisih`, `alasan`, `skor_risiko_baru`, `status_risiko`, `waktu_penyesuaian`) | Contoh §6.1 memakai `200` (tabel §1.3 menulis `201`), tidak mencantumkan `alasan` dan error `422 ERR_BATCH_TIDAK_AKTIF` | Mengharapkan `{ sukses, data: { batch, log } }` (objek batch lengkap & objek log lengkap). |
| **Pilihan aturan retur (`PUT /pengaturan/aturan-retur/:id`)** | Hanya `[0, 1, 3, 6]` bulan (`[A-04]`) | Sama (§8.3 / `02-Desain-Database.md` §3.3) | `mockData.js` memiliki distributor beraturan `2` bulan (`DST-006`, `DST-013`) yang ditolak `400` oleh backend default. |
| **Bahasa pesan validasi error** | `ubahPengaturan`, `ubahAturanRetur`, `penyesuaian` memakai pesan bahasa Indonesia; skema `paramId`, `queryPengingat`, `queryBatch`, `hitungUlangSkor` memakai pesan bawaan Joi (bahasa Inggris, mis. `id must be a number`) | Contoh §1.2 C berbahasa Indonesia | Mode mock frontend melempar `Error` JS lokal, belum mengonsumsi `error_kode`/`detail`. |
| **JSON rusak (`entity.parse.failed`)** | Handler di `router.js` hanya terpicu bila `express.json()` dipasang di dalam/setelah konteks router yang sama; jika `express.json()` dipasang di root `app` sebelum `app.use('/api/v1', router)`, error parsing ditangani handler error Express di root `app` | §1.2 C mengharapkan JSON `400 ERR_VALIDASI` | — |

---

## Format Standar Envelope & Error (Berlaku untuk Semua Endpoint HTTP)

### Envelope Sukses
| Field | Tipe | Penjelasan | Status Kesesuaian |
| --- | --- | --- | --- |
| `sukses` | `boolean` | Selalu `true` pada respons 2xx. | `✅ Sama` (§1.2 A) |
| `pesan` | `string` | Pesan ringkas hasil operasi berbahasa Indonesia. | `✅ Sama` (§1.2 A) · `⚠️ Beda Frontend` (beberapa method `api.js` tidak mengembalikan `pesan`) |
| `data` | `object \| array` | Muatan utama respons. | `✅ Sama` (§1.2 A) · `⚠️ Beda Frontend` (beberapa method `api.js` tanpa wrapper `data`) |
| `meta` | `object` *(opsional)* | Metadata tambahan (paginasi/agregasi di `GET /batches`, dampak perubahan di `PUT /pengaturan`). | `✅ Sama` (paginasi §1.2 B) · `⚠️ Beda Kontrak API` (field tambahan di luar paginasi) |

### Envelope Error (`4xx` / `5xx`)
| Field | Tipe | Penjelasan | Status Kesesuaian |
| --- | --- | --- | --- |
| `sukses` | `boolean` | Selalu `false`. | `✅ Sama` (§1.2 C) |
| `pesan` | `string` | Pesan kesalahan umum. | `✅ Sama` (§1.2 C) |
| `error_kode` | `string` | Kode mesin: `ERR_VALIDASI`, `AUTH_REQUIRED`, `AUTH_FORBIDDEN`, `ERR_TIDAK_DITEMUKAN`, `ERR_INVALID_STOCK_VALUE`, `ERR_BATCH_TIDAK_AKTIF`, `ERR_SERVER`. | `✅ Sama` (§1.2 C) · `⚠️ Beda Kontrak API` (`ERR_BATCH_TIDAK_AKTIF` adalah tambahan `[A-14]`) |
| `detail` | `array<{ field, pesan }>` *(opsional)* | Daftar kesalahan validasi per field (hanya ada pada `400 ERR_VALIDASI`). | `✅ Sama` (§1.2 C) |

---

## Daftar Berkas & Penjelasan Field per Endpoint

### 1. `GET /api/v1/pengaturan`
- **Berkas:** [`get-pengaturan.json`](./get-pengaturan.json)
- **Akses:** `admin` (`401 AUTH_REQUIRED` jika belum login, `403 AUTH_FORBIDDEN` jika `karyawan`).
- **Acuan:** Kontrak API §8.1 · Frontend `api.getSettings()`

| Field (`data.*`) | Tipe | Penjelasan | Status Kesesuaian |
| --- | --- | --- | --- |
| `tanggal_acuan` | `string (YYYY-MM-DD)` | Tanggal acuan sistem seragam untuk pengingat, tabel, dan dashboard (`[A-01]`). | `✅ Sama` |
| `stok_minimum_default` | `number` | Ambang default stok menipis bila obat tidak punya `stok_minimum`. | `✅ Sama` |
| `batas_kedaluwarsa_warning_hari` | `number` | Jendela hari peringatan mendekati kedaluwarsa (default `90`). | `✅ Sama` |
| `batas_retur_warning_hari` | `number` | Jendela hari peringatan mendesak retur (default `30`). | `✅ Sama` |
| *(wrapper)* | `object` | Respons dibungkus `{ sukses, pesan, data }`. | `✅ Sama` (Kontrak §8.1) · `⚠️ Beda Frontend` (`api.getSettings()` mengembalikan objek pengaturan langsung tanpa wrapper) |

---

### 2. `PUT /api/v1/pengaturan`
- **Berkas:** [`put-pengaturan.json`](./put-pengaturan.json)
- **Akses:** `admin` · **Error di contoh:** `400` payload kosong, `400` tanggal mustahil (`2026-02-30`), `400` multi-field tidak valid, `403` karyawan.
- **Acuan:** Kontrak API §8.2 · Frontend `api.updateSettings()`

| Field | Tipe | Penjelasan | Status Kesesuaian |
| --- | --- | --- | --- |
| `data.tanggal_acuan` | `string (YYYY-MM-DD)` | Nilai `tanggal_acuan` setelah diperbarui. | `✅ Sama` |
| `data.stok_minimum_default` | `number` | Nilai `stok_minimum_default` setelah diperbarui. | `✅ Sama` |
| `data.batas_kedaluwarsa_warning_hari` | `number` | Nilai `batas_kedaluwarsa_warning_hari` setelah diperbarui. | `✅ Sama` |
| `data.batas_retur_warning_hari` | `number` | Nilai `batas_retur_warning_hari` setelah diperbarui. | `✅ Sama` |
| `meta.batch_status_retur_berubah` | `number` | Jumlah batch aktif yang kolom `status_retur`-nya berubah akibat perubahan `tanggal_acuan`. | `⚠️ Beda Kontrak API` (tidak ada di §8.2) · `⚠️ Beda Frontend` (tidak dipakai `updateSettings`) |
| `meta.hitung_ulang_skor` | `object \| null` | `{ dijadwalkan: boolean, jumlah_batch: number }` bila `tanggal_acuan` berubah; `null` bila tidak. | `⚠️ Beda Kontrak API` (tidak ada di §8.2) · `⚠️ Beda Frontend` |

---

### 3. `GET /api/v1/pengaturan/aturan-retur`
- **Berkas:** [`get-pengaturan-aturan-retur.json`](./get-pengaturan-aturan-retur.json)
- **Akses:** `admin` · **Error di contoh:** `401`, `403`.
- **Acuan:** Kontrak API §8.3 · Frontend `api.getDistributors()`

| Field (`data[]`) | Tipe | Penjelasan | Status Kesesuaian |
| --- | --- | --- | --- |
| `distributor_id` | `number` | ID distributor PBF. | `✅ Sama` (Kontrak §8.3) · `⚠️ Beda Frontend` (frontend memakai `id` pada daftar distributor) |
| `kode_distributor` | `string` | Kode distributor (mis. `DST-001`). | `✅ Sama` (Kontrak §8.3) · `⚠️ Beda Frontend` (frontend memakai `kode`) |
| `nama_distributor` | `string` | Nama distributor. | `✅ Sama` (Kontrak §8.3) · `⚠️ Beda Frontend` (frontend memakai `nama`) |
| `bulan_sebelum_kedaluwarsa` | `number \| null` | Nilai aturan tersimpan di tabel `aturan_retur`; `null` jika distributor belum punya baris aturan. | `⚠️ Beda Kontrak API` (§8.3 selalu angka, belum mendokumentasikan `null`) · `⚠️ Beda Frontend` (frontend memakai `aturan_retur_bulan`) |
| `keterangan` | `string \| null` | Catatan kebijakan retur distributor. | `✅ Sama` (Kontrak §8.3) · `⚠️ Beda Frontend` (tidak ada di objek distributor frontend) |
| `bulan_efektif` | `number` | Bulan aturan yang benar-benar dipakai dalam hitungan (default `6` bila `bulan_sebelum_kedaluwarsa` `null`, `[A-03]`). | `⚠️ Beda Kontrak API` (tambahan) · `⚠️ Beda Frontend` |
| `memakai_default` | `boolean` | `true` jika distributor belum punya aturan khusus sehingga memakai default 6 bulan. | `⚠️ Beda Kontrak API` (tambahan) · `⚠️ Beda Frontend` |

---

### 4. `PUT /api/v1/pengaturan/aturan-retur/:distributor_id`
- **Berkas:** [`put-pengaturan-aturan-retur.json`](./put-pengaturan-aturan-retur.json)
- **Akses:** `admin` · **Error di contoh:** `400` pilihan bulan `2` ditolak (`[A-04]`), `404` distributor tidak ada, `403` karyawan.
- **Acuan:** Kontrak API §8.4 · Frontend `api.updateAturanDistributor()`

| Field (`data.*`) | Tipe | Penjelasan | Status Kesesuaian |
| --- | --- | --- | --- |
| `distributor_id` | `number` | ID distributor yang diubah aturannya. | `✅ Sama` (Kontrak §8.4) · `⚠️ Beda Frontend` (frontend mengembalikan objek distributor lengkap) |
| `bulan_sebelum_kedaluwarsa` | `number` | Aturan baru (`0`, `1`, `3`, atau `6` bulan). | `✅ Sama` (Kontrak §8.4) · `⚠️ Beda Frontend` (frontend memakai `aturan_retur_bulan` dan `mockData.js` punya nilai `2`) |
| `total_batch_terdampak` | `number` | Jumlah seluruh batch non-terminal milik distributor tersebut yang diproses ulang. | `✅ Sama` (Kontrak §8.4) · `⚠️ Beda Frontend` |
| `total_batch_berubah` | `number` | Jumlah batch yang `batas_retur` atau `status_retur`-nya benar-benar berubah. | `⚠️ Beda Kontrak API` (tidak ada di §8.4) · `⚠️ Beda Frontend` |
| `hitung_ulang_skor` | `object \| null` | `{ dijadwalkan: boolean, jumlah_batch: number }` untuk penjadwalan ulang skor risiko di latar (`[A-09]`). | `⚠️ Beda Kontrak API` (tidak ada di §8.4) · `⚠️ Beda Frontend` |

---

### 5. `GET /api/v1/pengingat`
- **Berkas:** [`get-pengingat.json`](./get-pengingat.json)
- **Akses:** `admin | karyawan` · **Query:** `tipe` (`semua | retur | lewat_batas | kedaluwarsa | stok_menipis`), `limit`.
- **Error di contoh:** `400` `tipe=ngawur`, `401` tanpa login.
- **Acuan:** Kontrak API §5.1 · Frontend `api.getPengingat()`

> **Perilaku query `tipe` & `limit`:** Filter `tipe` dan `limit` hanya menyaring `data.daftar_item`; field `data.total_pengingat`, `data.ringkasan`, dan `data.daftar` tetap berisi hitungan penuh seluruh kategori.

#### Field Top-Level `data`
| Field (`data.*`) | Tipe | Penjelasan | Status Kesesuaian |
| --- | --- | --- | --- |
| `tanggal_acuan_sistem` | `string (YYYY-MM-DD)` | Tanggal acuan yang dipakai menghitung pengingat. | `✅ Sama` (Kontrak §5.1) · `⚠️ Beda Frontend` (frontend memakai `tanggal_acuan` di root respons) |
| `total_pengingat` | `number` | Total seluruh item di `daftar_item` sebelum filter `tipe`/`limit`. | `✅ Sama` (Kontrak §5.1) · `⚠️ Beda Frontend` (tidak ada di frontend) |
| `ringkasan.bisa_diretur` | `number` | Jumlah batch aktif berstatus `bisa_diretur`. | `⚠️ Beda Kontrak API` (tambahan di luar §5.1) · `⚠️ Beda Frontend` (frontend memakai `ringkasan.total_bisa_diretur` di root) |
| `ringkasan.mendesak_retur` | `number` | Jumlah batch `bisa_diretur` dalam jendela `batas_retur_warning_hari`. | `✅ Sama` (Kontrak §5.1) · `⚠️ Beda Frontend` (`ringkasan.total_mendesak_retur` di root) |
| `ringkasan.lewat_batas_retur` | `number` | Jumlah batch aktif berstatus `lewat_batas`. | `⚠️ Beda Kontrak API` (tambahan) · `⚠️ Beda Frontend` (`ringkasan.total_lewat_batas` di root) |
| `ringkasan.mendekati_kedaluwarsa` | `number` | Jumlah batch aktif dalam jendela `batas_kedaluwarsa_warning_hari` (termasuk yang sudah ED). | `✅ Sama` (Kontrak §5.1) · `⚠️ Beda Frontend` (`ringkasan.total_mendekati_kedaluwarsa` di root) |
| `ringkasan.stok_menipis` | `number` | Jumlah batch/obat aktif dengan stok `≤ stok_minimum` (`[A-11]`). | `✅ Sama` (Kontrak §5.1) · `⚠️ Beda Frontend` (`ringkasan.total_stok_menipis` di root) |
| `daftar.{bisa_diretur, mendesak_retur, lewat_batas_retur, mendekati_kedaluwarsa, stok_menipis}` | `object` | Pengelompokan item per kategori (`snake_case`). | `⚠️ Beda Kontrak API` (tidak ada di §5.1) · `⚠️ Beda Frontend` (frontend meletakkan langsung di `data.{bisaDiretur, mendesakRetur, lewatBatasRetur, mendekatiKedaluwarsa, stokMenipis}` dalam `camelCase`) |
| `daftar_item` | `array` | Daftar datar seluruh alert (`mendesak_retur`, `lewat_batas_retur`, `mendekati_kedaluwarsa`, `stok_menipis`) urut tenggat terdekat (`stok_menipis` di akhir). | `✅ Sama` (Kontrak §5.1) · `⚠️ Beda Frontend` (tidak dipakai frontend) |

#### Field Tiap Item (`daftar.*[]` dan `daftar_item[]`)
| Field Item | Tipe | Penjelasan | Status Kesesuaian |
| --- | --- | --- | --- |
| `batch_id` | `number` | ID batch. | `✅ Sama` (Kontrak §5.1) · `⚠️ Beda Frontend` (frontend memakai `id`) |
| `obat_id` | `number` | ID obat. | `⚠️ Beda Kontrak API` (tambahan) · `✅ Sama` (Frontend) |
| `nama_obat` | `string` | Nama obat. | `✅ Sama` |
| `nomor_batch` | `string` | Nomor batch. | `✅ Sama` |
| `distributor_id` | `number` | ID distributor. | `⚠️ Beda Kontrak API` (tambahan) · `✅ Sama` (Frontend) |
| `distributor` | `string` | Nama distributor. | `✅ Sama` (Kontrak §5.1) · `⚠️ Beda Frontend` (frontend memakai `nama_distributor`) |
| `telepon_distributor` | `string \| null` | Nomor telepon distributor. | `⚠️ Beda Kontrak API` (tambahan) · `⚠️ Beda Frontend` |
| `sisa_stok` | `number` | Jumlah stok tersisa (`jumlah_saat_ini`). | `✅ Sama` (Kontrak §5.1) · `⚠️ Beda Frontend` (frontend memakai `jumlah_saat_ini`) |
| `satuan` | `string \| null` | Satuan obat (`strip`, `botol`, dll.). | `⚠️ Beda Kontrak API` (tambahan) · `⚠️ Beda Frontend` |
| `stok_minimum` | `number` | Stok minimum efektif obat/default. | `⚠️ Beda Kontrak API` (tambahan) · `⚠️ Beda Frontend` |
| `nilai_stok` | `number` | Nilai rupiah stok tersisa (`jumlah_saat_ini × harga_beli_satuan`). | `⚠️ Beda Kontrak API` (tambahan) · `⚠️ Beda Frontend` (frontend memakai `nilai_total`) |
| `tanggal_kedaluwarsa` | `string (YYYY-MM-DD)` | Tanggal kedaluwarsa batch. | `✅ Sama` |
| `batas_retur` | `string \| null` | Batas retur (`null` bila distributor aturan 0). | `✅ Sama` |
| `sisa_hari_retur`, `sisa_hari_exp` | `number \| null` | Selisih hari ke batas retur / ED relatif ke `tanggal_acuan`. | `⚠️ Beda Kontrak API` (tambahan alias untuk frontend) · `✅ Sama` (Frontend) |
| `hari_menuju_batas_retur`, `hari_menuju_kedaluwarsa` | `number \| null` | Alias sesuai nama field kontrak §5.1 (selalu hadir pada semua item, bisa `null`). | `✅ Sama` (Kontrak §5.1) · `⚠️ Beda Frontend` |
| `sudah_kedaluwarsa` | `boolean` | `true` bila `sisa_hari_exp <= 0` (`[A-19]`). | `⚠️ Beda Kontrak API` (tambahan) · `✅ Sama` (Frontend) |
| `status_retur` | `string` | Status retur efektif (`bisa_diretur`, `lewat_batas`, `tidak_bisa_diretur`). | `✅ Sama` |
| `skor_risiko` | `number \| null` | Skor risiko dari model (`0..1`) atau `null`. | `✅ Sama` |
| `status_risiko` | `string` | Label risiko asli dari model (`tinggi`, `sedang`, `rendah`, `belum_tersedia`). | `⚠️ Beda Kontrak API` (tidak ada di §5.1) · `⚠️ Beda Frontend` (frontend menimpa langsung saat lewat batas) |
| `status_risiko_tampil` | `string` | Label risiko untuk badge UI (`tinggi` + `lewat_batas` diturunkan ke `sedang`, `[A-18]`). | `⚠️ Beda Kontrak API` (tambahan) · `⚠️ Beda Frontend` |
| `urgensi` | `string` | `kritis` / `waspada` / `normal` (ambang `[A-12]`). | `⚠️ Beda Kontrak API` (tambahan) · `✅ Sama` (Frontend) |
| `kategori_alert` | `string` | `mendesak_retur`, `lewat_batas_retur`, `mendekati_kedaluwarsa`, `stok_menipis` (tidak ada pada item `daftar.bisa_diretur`). | `✅ Sama` (Kontrak §5.1, kecuali tambahan `lewat_batas_retur`) · `⚠️ Beda Frontend` |
| `tenggat` | `string \| null` | Tanggal tenggat utama untuk pengurutan (`batas_retur` / `tanggal_kedaluwarsa` / `null` untuk stok menipis). | `⚠️ Beda Kontrak API` (tambahan) · `⚠️ Beda Frontend` |
| `aksi_disarankan` | `string` *(khusus `lewat_batas_retur`)* | `prioritas_jual` (belum ED) atau `catat_dibuang` (sudah ED), sesuai triage #7. | `⚠️ Beda Kontrak API` (tambahan) · `⚠️ Beda Frontend` (frontend menurunkan di UI dari `sudah_kedaluwarsa`) |
| `pesan_peringatan` | `string` | Kalimat peringatan siap tampil (tidak ada pada `daftar.bisa_diretur`). | `✅ Sama` (Kontrak §5.1) · `⚠️ Beda Frontend` |

---

### 6. `GET /api/v1/pengingat/notifikasi`
- **Berkas:** [`get-pengingat-notifikasi.json`](./get-pengingat-notifikasi.json)
- **Akses:** `admin | karyawan` · **Error di contoh:** `401`.
- **Acuan:** Kontrak API §10.2 · Frontend `api.getHeaderNotifications()`

| Field (`data[]`) | Tipe | Penjelasan | Status Kesesuaian |
| --- | --- | --- | --- |
| `id` | `string` | ID unik notifikasi (`exp-ret-<id>`, `warn-ret-<id>`, `low-<id>`). | `✅ Sama` |
| `type` | `string` | Jenis notifikasi (`lewat_batas`, `wajib_retur`, `stok_tipis`). | `⚠️ Beda Kontrak API` (tidak disebut di §10.2) · `✅ Sama` (Frontend) |
| `tone` | `string` | Warna badge (`rose`, `amber`, `teal`). | `✅ Sama` |
| `title` | `string` | Judul singkat notifikasi. | `✅ Sama` |
| `nama_obat` | `string` | Nama obat. | `✅ Sama` |
| `nomor_batch` | `string` | Nomor batch. | `✅ Sama` |
| `batch_id` | `number` | ID numerik batch terkait. | `⚠️ Beda Kontrak API` (tambahan) · `⚠️ Beda Frontend` (tidak ada di `getHeaderNotifications`) |
| `detail` | `string` | Keterangan singkat (distributor + tanggal batas atau sisa unit). | `✅ Sama` |
| `targetPage` | `string` | Halaman tujuan klik (`"pengingat"`). | `✅ Sama` |
| *(wrapper)* | `object` | Dibungkus `{ sukses, pesan, data: [...] }`. | `✅ Sama` (Kontrak §1.2) · `⚠️ Beda Frontend` (`getHeaderNotifications()` mengembalikan array langsung) |

---

### 7. `POST /api/v1/penyesuaian-stok`
- **Berkas:** [`post-penyesuaian-stok.json`](./post-penyesuaian-stok.json)
- **Akses:** `admin | karyawan` · **Sukses:** `200` (prediksi stub & fallback prediksi mati).
- **Error di contoh:** `400` field wajib kosong, `404` batch tidak ada, `422 ERR_INVALID_STOCK_VALUE` (stok `-5`), `422 ERR_BATCH_TIDAK_AKTIF` (batch sudah diretur), `401` tanpa login.
- **Acuan:** Kontrak API §6.1 · Frontend `api.simpanPenyesuaianStok()`

| Field (`data.*`) | Tipe | Penjelasan | Status Kesesuaian |
| --- | --- | --- | --- |
| *(HTTP status)* | `200 OK` | Mengikuti contoh §6.1. | `⚠️ Beda Kontrak API` (tabel §1.3 menulis `201 Created`, contoh §6.1 menulis `200 OK`) |
| `batch_id` | `number` | ID batch yang disesuaikan. | `✅ Sama` (Kontrak §6.1) · `⚠️ Beda Frontend` (frontend mengharapkan `{ batch, log }`) |
| `jumlah_sebelum` | `number` | Stok sebelum penyesuaian. | `✅ Sama` (Kontrak §6.1) · `⚠️ Beda Frontend` (di frontend ada di `data.log.jumlah_sebelum`) |
| `jumlah_sesudah` | `number` | Stok fisik baru. | `✅ Sama` (Kontrak §6.1) · `⚠️ Beda Frontend` (`data.log.jumlah_sesudah`) |
| `selisih` | `number` | `jumlah_sesudah - jumlah_sebelum`. | `✅ Sama` (Kontrak §6.1) · `⚠️ Beda Frontend` (`data.log.selisih`) |
| `alasan` | `string \| null` | Alasan penyesuaian (`null` bila kosong). | `⚠️ Beda Kontrak API` (tidak tercantum di contoh §6.1) · `⚠️ Beda Frontend` (`data.log.alasan`) |
| `skor_risiko_baru` | `number \| null` | Skor risiko terbaru setelah hitung ulang (`null` saat fallback atau stok 0). | `✅ Sama` (Kontrak §6.1) · `⚠️ Beda Frontend` (tidak dihitung di `simpanPenyesuaianStok`) |
| `status_risiko` | `string` | Label risiko terbaru (`tinggi`, `sedang`, `rendah`, `belum_tersedia`). | `✅ Sama` (Kontrak §6.1) · `⚠️ Beda Frontend` |
| `waktu_penyesuaian` | `string (ISO-8601 UTC)` | Stempel waktu penyesuaian tercatat. | `✅ Sama` (Kontrak §6.1) · `⚠️ Beda Frontend` (frontend memakai `data.log.tanggal` berformat `YYYY-MM-DD HH:mm`) |

---

### 8. `GET /api/v1/batches/:id/penyesuaian`
- **Berkas:** [`get-batches-id-penyesuaian.json`](./get-batches-id-penyesuaian.json)
- **Akses:** `admin | karyawan` · **Error di contoh:** `400` `id=abc`, `401` tanpa login.
- **Status Endpoint:** `🆕 Tambahan Backend` — tidak tercantum sebagai endpoint terpisah di `docs/03-API-Contract.md` (di §4.2 riwayat hanya muncul tertanam di `GET /batches/:id`). Catatan: jika `id` valid secara tipe namun tidak ada di DB, endpoint mengembalikan `200` dengan `data: []`.
- **Acuan Frontend:** `api.getRiwayatPenyesuaian()` (mengambil riwayat **semua** batch sekaligus tanpa wrapper, dengan field tambahan `batch_id`, `nama_obat`, `nomor_batch`).

| Field (`data[]`) | Tipe | Penjelasan | Status Kesesuaian |
| --- | --- | --- | --- |
| `id` | `number` | ID log penyesuaian stok. | `✅ Sama` (dengan item `riwayat_penyesuaian` §4.2 & Frontend) |
| `tanggal` | `string (ISO-8601 UTC)` | Waktu penyesuaian tercatat. | `✅ Sama` (§4.2) · `⚠️ Beda Frontend` (frontend memakai `YYYY-MM-DD HH:mm`) |
| `jumlah_sebelum` | `number` | Stok sebelum penyesuaian. | `✅ Sama` |
| `jumlah_sesudah` | `number` | Stok sesudah penyesuaian. | `✅ Sama` |
| `selisih` | `number` | Perubahan stok. | `✅ Sama` |
| `alasan` | `string \| null` | Alasan penyesuaian. | `✅ Sama` |
| `petugas` | `string \| null` | Nama petugas yang mencatat. | `✅ Sama` |
| *(field tidak ada di backend)* | — | `batch_id`, `nama_obat`, `nomor_batch` tidak disertakan karena endpoint khusus satu batch. | `⚠️ Beda Frontend` (`PenyesuaianStokPage.jsx` menampilkan tabel riwayat global lintas batch) |

---

### 9. `GET /api/v1/batches`
- **Berkas:** [`get-batches.json`](./get-batches.json)
- **Akses:** `admin | karyawan` · **Query tambahan di luar §4.1:** `obat_id`, `kategori`, `hanya_aktif` (default `true`), `sort_by` (`nilai_total`, `nomor_batch`).
- **Error di contoh:** `400` `status_risiko=parah`, `401` tanpa login.
- **Acuan:** Kontrak API §4.1 · Frontend `api.getBatches()`

#### Field Tiap Item Batch (`data[]`)
| Field (`data[]`) | Tipe | Penjelasan | Status Kesesuaian |
| --- | --- | --- | --- |
| `id` | `number` | ID batch. | `✅ Sama` |
| `nomor_batch` | `string` | Nomor batch. | `✅ Sama` |
| `obat.id`, `obat.kode_obat`, `obat.nama_obat`, `obat.satuan`, `obat.stok_minimum` | `object` | Detail master obat bersarang. | `✅ Sama` (Kontrak §4.1) · `⚠️ Beda Frontend` (frontend memakai field datar `obat_id`, `nama_obat` di root batch) |
| `obat.kategori` | `string \| null` | Kategori/golongan obat. | `⚠️ Beda Kontrak API` (tidak ada di §4.1) · `⚠️ Beda Frontend` |
| `distributor.id`, `distributor.nama`, `distributor.aturan_retur_bulan` | `object` | Detail distributor bersarang. | `✅ Sama` (Kontrak §4.1) · `⚠️ Beda Frontend` (frontend memakai `distributor_id`, `nama_distributor` datar di root batch) |
| `distributor.kode`, `distributor.telepon` | `string \| null` | Kode dan nomor telepon distributor. | `⚠️ Beda Kontrak API` (tidak ada di §4.1) · `⚠️ Beda Frontend` |
| `tanggal_masuk`, `tanggal_kedaluwarsa` | `string (YYYY-MM-DD)` | Tanggal masuk dan kedaluwarsa. | `✅ Sama` |
| `batas_retur` | `string \| null` | Batas retur (`null` bila aturan 0 bulan). | `✅ Sama` |
| `jumlah_awal`, `jumlah_saat_ini` | `number` | Jumlah stok awal dan saat ini. | `✅ Sama` |
| `harga_beli_satuan`, `nilai_total` | `number` | Harga beli satuan & nilai total (dihitung dalam satuan sen agar sama persis dengan dashboard, TC-DSH-001). | `✅ Sama` |
| `skor_risiko` | `number \| null` | Skor risiko model (`0..1`) atau `null`. | `✅ Sama` |
| `status_risiko` | `string` | Label asli model (`rendah`, `sedang`, `tinggi`, `belum_tersedia`). | `✅ Sama` (Kontrak §4.1 + catatan §1) · `⚠️ Beda Frontend` (frontend menimpa langsung menjadi `sedang` saat lewat batas) |
| `status_risiko_tampil` | `string` | Label untuk tampilan badge & filter query `status_risiko` (`[A-18]`). | `⚠️ Beda Kontrak API` (tambahan) · `⚠️ Beda Frontend` |
| `status_retur` | `string` | `bisa_diretur`, `lewat_batas`, `tidak_bisa_diretur`, `sudah_diretur`, `dibuang` (`[A-15]`). | `⚠️ Beda Kontrak API` (§4.1 menyebut `belum_diretur`, tanpa `tidak_bisa_diretur`/`dibuang`) · `✅ Sama` (Frontend) |
| `sisa_hari_retur`, `sisa_hari_exp` | `number \| null` | Selisih hari terhadap `tanggal_acuan`. | `⚠️ Beda Kontrak API` (tambahan) · `⚠️ Beda Frontend` (frontend menghitung sendiri di klien) |
| `sudah_kedaluwarsa`, `aktif` | `boolean` | Status kedaluwarsa (`sisa_hari_exp <= 0`) dan keaktifan batch. | `⚠️ Beda Kontrak API` (tambahan) · `⚠️ Beda Frontend` |
| `keterangan` | `string \| null` | Keterangan batch (mis. `"Skor belum tersedia"` saat fallback prediksi). | `⚠️ Beda Kontrak API` (tidak ada di §4.1) · `✅ Sama` (Frontend) |

#### Field `meta`
| Field (`meta.*`) | Tipe | Penjelasan | Status Kesesuaian |
| --- | --- | --- | --- |
| `halaman`, `limit`, `total_data`, `total_halaman` | `number` | Metadata paginasi standar. | `✅ Sama` (Kontrak §4.1) · `⚠️ Beda Frontend` (frontend tidak memakai `meta` paginasi) |
| `tanggal_acuan` | `string (YYYY-MM-DD)` | Tanggal acuan yang dipakai untuk seluruh kalkulasi. | `⚠️ Beda Kontrak API` (tidak ada di §4.1) · `⚠️ Beda Frontend` (frontend meletakkan `tanggal_acuan` di root respons) |
| `agregasi.{total_batch, total_unit, total_nilai}` | `object` | Total seluruh hasil filter lintas halaman (bukan hanya halaman aktif). | `⚠️ Beda Kontrak API` (tidak ada di §4.1) · `⚠️ Beda Frontend` (frontend menghitung sendiri di klien) |

---

### 10. `GET /api/v1/batches/:id`
- **Berkas:** [`get-batches-id.json`](./get-batches-id.json)
- **Akses:** `admin | karyawan` · **Error di contoh:** `400` `id=0`, `404` batch `999`, `401` tanpa login.
- **Acuan:** Kontrak API §4.2 · Frontend *(belum memanggil endpoint detail per ID)*

| Field (`data.*`) | Tipe | Penjelasan | Status Kesesuaian |
| --- | --- | --- | --- |
| *(seluruh field batch dari `perkayaBatch`)* | — | Sama persis dengan item `GET /batches` (termasuk `tanggal_masuk`, `jumlah_awal`, `harga_beli_satuan`, `nilai_total`, `obat.kode_obat/kategori/stok_minimum`, `distributor.kode/telepon/aturan_retur_bulan`, `status_risiko_tampil`, `sisa_hari_*`, `sudah_kedaluwarsa`, `aktif`, `keterangan`). | `⚠️ Beda Kontrak API` (lebih lengkap dari contoh ringkas §4.2) · `🆕 Tambahan Backend` (belum dipakai frontend) |
| `riwayat_penyesuaian` | `array<object>` | Daftar log penyesuaian stok (`id`, `tanggal`, `jumlah_sebelum`, `jumlah_sesudah`, `selisih`, `alasan`, `petugas`) urut terbaru. | `✅ Sama` (Kontrak §4.2) |

---

### 11. `GET /api/v1/dashboard/ringkasan`
- **Berkas:** [`get-dashboard-ringkasan.json`](./get-dashboard-ringkasan.json)
- **Akses:** `admin` · **Error di contoh:** `401`, `403`.
- **Acuan:** Kontrak API §7.1 · Frontend `api.getDashboardSummary()`

| Field (`data.*`) | Tipe | Penjelasan | Status Kesesuaian |
| --- | --- | --- | --- |
| `tanggal_acuan` | `string (YYYY-MM-DD)` | Tanggal acuan sistem. | `✅ Sama` |
| `total_nilai_persediaan` | `number` | Total nilai rupiah seluruh batch aktif (sama persis sampai sen dengan `GET /batches` tanpa filter). | `✅ Sama` |
| `total_batch_aktif` | `number` | Jumlah batch aktif. | `✅ Sama` |
| `jumlah_batch_berisiko_tinggi` | `number` | Jumlah batch aktif berisiko (`status_risiko === 'tinggi'` atau `status_retur === 'lewat_batas'`, `[A-13]`). | `✅ Sama` (Kontrak §7.1) · `⚠️ Beda Frontend` (frontend memakai `jumlah_batch_berisiko`) |
| `total_nilai_berisiko_hangus` | `number` | Total nilai rupiah batch berisiko. | `✅ Sama` (Kontrak §7.1) · `⚠️ Beda Frontend` (frontend memakai `total_nilai_berisiko`) |
| `persentase_nilai_berisiko` | `number` | Persentase nilai berisiko terhadap total persediaan (angka, 2 desimal). | `✅ Sama` (Kontrak §7.1) · `⚠️ Beda Frontend` (frontend memakai `persentase_berisiko` bertipe string `.toFixed(1)` atau `0`) |
| `distributor_berisiko_terbanyak` | `array<object>` | Maks 5 distributor dengan nilai berisiko terbesar: `{ distributor_id, nama_distributor, aturan_retur_bulan, jumlah_batch_berisiko, nilai_berisiko }`. | `✅ Sama` (Kontrak §7.1) · `⚠️ Beda Frontend` (frontend memakai `distributor_terancam` maks 4 item dengan `{ nama, nilai, batch_count }`) |
| `tindakan_segera` | `array<object>` | Maks 10 item mendesak retur: `{ batch_id, nama_obat, nomor_batch, distributor, nilai_stok, hari_tersisa_retur, status }`. | `✅ Sama` (Kontrak §7.1) · `⚠️ Beda Frontend` (frontend menyusun sendiri dari `getPengingat()`) |
| `ringkasan_pengingat` | `object` | Ringkasan 5 angka kategori pengingat (`bisa_diretur`, `mendesak_retur`, `lewat_batas_retur`, `mendekati_kedaluwarsa`, `stok_menipis`). | `⚠️ Beda Kontrak API` (tidak ada di §7.1) · `⚠️ Beda Frontend` (frontend mengambil dari `getPengingat().ringkasan`) |

---

### 12. `POST /api/v1/risiko/hitung-ulang`
- **Berkas:** [`post-risiko-hitung-ulang.json`](./post-risiko-hitung-ulang.json)
- **Akses:** `admin` · **Error di contoh:** `400` `batch_ids` tidak valid, `403` karyawan, `401` tanpa login.
- **Status Endpoint:** `🆕 Tambahan Backend` — endpoint usulan di `backend/src/bisnis/http/router.js` untuk memicu hitung ulang skor batch yang masih `belum_tersedia` atau daftar `batch_ids` tertentu; belum ada di `docs/03-API-Contract.md` maupun frontend.

| Field (`data.*`) | Tipe | Penjelasan | Status Kesesuaian |
| --- | --- | --- | --- |
| `diproses` | `number` | Total batch aktif yang diproses. | `🆕 Tambahan Backend` |
| `sukses` | `number` | Jumlah batch yang berhasil mendapat skor baru dari layanan prediksi. | `🆕 Tambahan Backend` |
| `fallback` | `number` | Jumlah batch yang gagal/timeout lalu masuk jalur fallback (`belum_tersedia` atau `skor_lama`). | `🆕 Tambahan Backend` |

---

### 13. Fungsi Non-Router: `bisnis.batchMasuk.siapkan` & `setelahTersimpan`
- **Berkas:** [`fungsi-batch-masuk.json`](./fungsi-batch-masuk.json)
- **Posisi:** Titik sambung internal (`[A-21]`) untuk endpoint `POST /api/v1/faktur/simpan-batch` (Kontrak API §3.2) yang dikelola modul utama backend; belum dipasang sebagai route di `http/router.js`.

#### Output `siapkan({ distributor_id, tanggal_masuk, items })`
| Field | Tipe | Penjelasan | Status Kesesuaian |
| --- | --- | --- | --- |
| `baris[]` | `array<object>` | Baris batch siap `INSERT` ke tabel `batch`: mewarisi field input (`obat_id`, `nomor_batch`, `tanggal_kedaluwarsa`, `jumlah`, `harga_beli_satuan`) plus `distributor_id`, `tanggal_masuk`, `jumlah_awal`, `jumlah_saat_ini`, `nilai_total`, `batas_retur`, `status_retur`, `skor_risiko` (`null`), `status_risiko` (`"belum_tersedia"`), `keterangan` (`"Skor belum tersedia"`). | `🆕 Tambahan Backend` (helper sebelum INSERT; router `POST /faktur/simpan-batch` tetap perlu memetakan hasil INSERT ke bentuk respons §3.2 `{ total_tersimpan, batch_tersimpan }`, sementara frontend `simpanBatchList` mengharapkan `{ sukses, data: createdBatches }`) |
| `aturan_retur_bulan` | `number` | Aturan retur efektif distributor (termasuk default `6` bila belum diatur). | `🆕 Tambahan Backend` |
| `tanggal_acuan` | `string (YYYY-MM-DD)` | Tanggal acuan yang dipakai memvalidasi `TC-INP-007` (`[A-22]`) dan menentukan `status_retur` awal. | `🆕 Tambahan Backend` |

#### Output `setelahTersimpan(batchIds)`
| Field (`[]`) | Tipe | Penjelasan | Status Kesesuaian |
| --- | --- | --- | --- |
| `id` | `number` | ID batch yang baru disimpan. | `🆕 Tambahan Backend` |
| `skor_risiko` | `number \| null` | Skor risiko dari model (`null` saat fallback). | `🆕 Tambahan Backend` |
| `status_risiko` | `string` | Label risiko (`rendah`, `sedang`, `tinggi`, atau `belum_tersedia` saat fallback). | `🆕 Tambahan Backend` |
| `keterangan` | `string \| null` | `null` bila sukses; `"Skor belum tersedia"` saat fallback. | `🆕 Tambahan Backend` |
| `sumber` | `string` | Sumber skor: nama klien prediksi (`"stub"` / `"http"`), `"fallback"`, atau `"skor_lama"`. | `🆕 Tambahan Backend` |
