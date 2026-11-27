'use strict';

const { rencanakanPenyesuaian } = require('../domain/penyesuaian');
const retur = require('../domain/retur');

/**
 * POST /penyesuaian-stok (docs/03 §6.1, TC-STK-001/002).
 * 1. Dalam SATU transaksi: kunci baris batch, catat riwayat, ubah jumlah & nilai_total.
 * 2. Setelah commit: hitung ulang skor (HTTP tidak boleh menahan kunci DB).
 *    Pengingat tidak perlu "diperbarui" karena selalu dihitung dari data terbaru.
 */
function buatLayananPenyesuaian(ctx) {
  const { repo, konfigurasi } = ctx;

  async function sesuaikan({ batch_id, jumlah_sesudah, alasan }, pengguna) {
    const { log, batch } = await repo.transaksi(async (r) => {
      const b = await r.ambilBatch(batch_id, { kunci: true });
      const rencana = rencanakanPenyesuaian(b, { jumlah_sesudah, alasan, user_id: pengguna && pengguna.id }, konfigurasi);
      const tersimpan = await r.catatPenyesuaian(rencana.log);
      await r.perbaruiBatch(b.id, rencana.perubahanBatch);
      return { log: tersimpan, batch: { ...b, ...rencana.perubahanBatch } };
    });

    let skor = { skor_risiko: batch.skor_risiko === undefined ? null : batch.skor_risiko, status_risiko: batch.status_risiko };
    // Stok 0 = batch tidak aktif lagi; tidak perlu memanggil model [A-23]
    if (retur.batchAktif(batch)) {
      const pengaturan = await ctx.pengaturan.ambil();
      skor = await ctx.risiko.hitungDanSimpan(batch, pengaturan);
    }

    return {
      batch_id: log.batch_id,
      jumlah_sebelum: log.jumlah_sebelum,
      jumlah_sesudah: log.jumlah_sesudah,
      selisih: log.selisih,
      alasan: log.alasan,
      skor_risiko_baru: skor.skor_risiko === null || skor.skor_risiko === undefined ? null : Number(skor.skor_risiko),
      status_risiko: skor.status_risiko,
      waktu_penyesuaian: new Date(log.created_at).toISOString(),
    };
  }

  async function riwayat(batchId) {
    return repo.daftarPenyesuaian(batchId);
  }

  return { sesuaikan, riwayat };
}

module.exports = { buatLayananPenyesuaian };
