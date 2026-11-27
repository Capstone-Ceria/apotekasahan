# `src/bisnis` — Logika Bisnis SIMAAF (Dio)

Modul ini berisi semua hitungan: batas retur, status retur, skor risiko + fallback,
pengingat, penyesuaian stok, tabel inventori, dan dashboard. Dibuat supaya
**tidak bergantung** pada keputusan fondasi yang belum final (struktur Express,
ORM, auth, siapa menulis klien prediksi).

Daftar asumsi & pertanyaan terbuka: [`docs/ASUMSI-LOGIKA-BISNIS.md`](../../../docs/ASUMSI-LOGIKA-BISNIS.md).

## Lapisan

```
http/          Router Express + validasi Joi. Tidak membuat app, tidak mengurus JWT.
services/      Alur kerja (transaksi, panggil prediksi, simpan). Tidak tahu SQL.
domain/        Rumus murni tanpa I/O: retur, risiko, pengingat, inventori, penyesuaian.
repositories/  Akses data. inMemory.js (tes) & postgres.js (raw pg). Kontrak: KONTRAK.md
adapters/      Klien layanan prediksi: http (FastAPI), stub (aturan sederhana), mati (uji fallback).
config/        SEMUA angka asumsi (ambang risiko, aturan default, jendela pengingat, dst).
lib/           Tanggal date-only UTC, uang dalam sen, error bisnis.
```

Arah ketergantungan hanya ke bawah: `http -> services -> domain`, dan `services -> repositories/adapters` lewat objek yang disuntikkan.

## Cara pakai di app utama (contoh untuk Charlene)

```js
const { Pool } = require('pg');
const { buatBisnis, buatRepoPostgres, buatKlienDariEnv } = require('./bisnis');
const { buatRouterBisnis } = require('./bisnis/http/router');

const bisnis = buatBisnis({
  repo: buatRepoPostgres(new Pool({ connectionString: process.env.DATABASE_URL })),
  prediksi: buatKlienDariEnv(process.env),           // PREDIKSI_MODE=http|stub|mati
  // konfigurasi: { risiko: { ambangTinggi: 0.8 } }  // timpa asumsi kalau perlu
});

app.use('/api/v1', buatRouterBisnis({ bisnis, auth: { wajibLogin, wajibAdmin } }));

// Di endpoint simpan-batch:
const { baris } = await bisnis.batchMasuk.siapkan({ distributor_id, tanggal_masuk, items });
// ... INSERT baris ke tabel batch, COMMIT ...
await bisnis.batchMasuk.setelahTersimpan(idBaru);   // tidak pernah gagal karena prediksi
```

## Perintah

```bash
npm test             # semua tes (node:test), tanpa DB
npm run dev:bisnis   # server coba dengan data memori, header X-Peran: admin|karyawan
```
