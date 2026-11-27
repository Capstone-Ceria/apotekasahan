'use strict';

const { buatKonfigurasi } = require('./config/default');
const { buatLayananPengaturan } = require('./services/pengaturan');
const { buatLayananRisiko } = require('./services/risiko');
const { buatLayananBatchMasuk } = require('./services/batchMasuk');
const { buatLayananPenyesuaian } = require('./services/penyesuaianStok');
const { buatLayananLaporan } = require('./services/laporan');

/**
 * Pintu masuk modul logika bisnis SIMAAF.
 *
 *   const bisnis = buatBisnis({ repo, prediksi });
 *   app.use('/api/v1', buatRouterBisnis({ bisnis, auth }));   // lihat http/router.js
 *
 * Semua ketergantungan luar (DB, layanan prediksi, logger, cara menjalankan
 * pekerjaan latar) DISUNTIKKAN di sini, jadi modul ini tidak peduli
 * framework/ORM apa yang dipilih Charlene.
 */
function buatBisnis({ repo, prediksi, konfigurasi, logger = console, jalankanLatar } = {}) {
  if (!repo) throw new Error('repo wajib diisi');
  if (!prediksi) throw new Error('prediksi wajib diisi (pakai buatKlienStub() kalau layanan belum ada)');

  const ctx = {
    repo,
    prediksi,
    logger,
    konfigurasi: buatKonfigurasi(konfigurasi),
  };

  // Hitung ulang skor di latar supaya respons PUT pengaturan tetap cepat.
  // Bisa diganti antrean sungguhan (BullMQ dll.) tanpa mengubah service lain.
  const latar = jalankanLatar || ((tugas) => setImmediate(() => tugas().catch((e) => logger.error('[latar]', e))));
  ctx.jadwalkanHitungUlangSkor = (ids) => {
    latar(() => ctx.risiko.hitungUlang({ ids }));
    return { dijadwalkan: true, jumlah_batch: ids.length };
  };

  ctx.pengaturan = buatLayananPengaturan(ctx);
  ctx.risiko = buatLayananRisiko(ctx);
  ctx.batchMasuk = buatLayananBatchMasuk(ctx);
  ctx.penyesuaian = buatLayananPenyesuaian(ctx);
  ctx.laporan = buatLayananLaporan(ctx);

  return {
    konfigurasi: ctx.konfigurasi,
    pengaturan: ctx.pengaturan,
    risiko: ctx.risiko,
    batchMasuk: ctx.batchMasuk,
    penyesuaian: ctx.penyesuaian,
    laporan: ctx.laporan,
  };
}

module.exports = {
  buatBisnis,
  ...require('./adapters/prediksi'),
  ...require('./repositories/inMemory'),
  ...require('./repositories/postgres'),
};
