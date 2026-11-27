# Kontrak Repository (akses data)

Semua service di `services/` hanya bicara ke objek `repo` dengan method di bawah.
Tidak ada SQL atau ORM di luar folder `repositories/`. Kalau Charlene memutuskan
skema/ORM lain (Prisma, Knex, Sequelize, raw `pg`), cukup buat implementasi baru
dengan method yang sama; logika bisnis dan tes tidak perlu diubah.

Implementasi yang ada:
- `inMemory.js`: untuk tes dan mock lokal (dipakai `test/`).
- `postgres.js`: raw SQL `pg` sesuai `docs/02-Desain-Database.md` v1.0. **Belum diuji ke DB sungguhan.**

| Method | Masukan | Keluaran |
| --- | --- | --- |
| `ambilPengaturan()` | - | objek `{ kunci: nilai }` (nilai string, seperti tabel `pengaturan`) |
| `simpanPengaturan(obj)` | `{ kunci: nilai }` | - (upsert per kunci) |
| `ambilDistributor(id)` | id | `{ id, kode, nama, ... }` atau `null` |
| `daftarAturanRetur()` | - | `[{ distributor_id, kode_distributor, nama_distributor, bulan_sebelum_kedaluwarsa (null bila belum diatur), keterangan }]` |
| `ambilAturanRetur(distributorId)` | id | `{ distributor_id, bulan_sebelum_kedaluwarsa, keterangan }` atau `null` |
| `simpanAturanRetur(distributorId, { bulan_sebelum_kedaluwarsa, keterangan })` | | baris tersimpan |
| `ambilBatch(id, { kunci })` | `kunci: true` = `SELECT ... FOR UPDATE` | baris batch gabungan (lihat di bawah) atau `null` |
| `daftarBatch({ distributor_id?, ids?, hanya_aktif? })` | | array baris batch gabungan |
| `perbaruiBatch(id, field)` | field kolom tabel `batch` | - |
| `catatPenyesuaian(log)` | baris `penyesuaian_stok` | baris + `id`, `created_at` |
| `daftarPenyesuaian(batchId)` | | `[{ id, tanggal, jumlah_sebelum, jumlah_sesudah, selisih, alasan, petugas }]` |
| `catatInferensi(rec)` | baris `riwayat_inferensi` | - |
| `transaksi(fn)` | `fn(repoTx)` async | hasil `fn`; rollback kalau `fn` melempar |

**Baris batch gabungan** = kolom tabel `batch` + `kode_obat, nama_obat, kategori, satuan, stok_minimum`
(dari `obat`) + `kode_distributor, nama_distributor, telepon_distributor` (dari `distributor`)
+ `aturan_retur_bulan` (dari `aturan_retur`, `null` kalau belum diatur).
