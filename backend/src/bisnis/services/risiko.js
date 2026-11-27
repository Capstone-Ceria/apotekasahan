'use strict';

const risiko = require('../domain/risiko');
const retur = require('../domain/retur');

/**
 * Pemanggilan layanan prediksi + fallback.
 * ATURAN UTAMA: fungsi di sini TIDAK PERNAH melempar error karena prediksi gagal.
 * Simpan batch / penyesuaian stok tidak boleh ikut gagal (TC-RSK-002).
 */
function buatLayananRisiko(ctx) {
  const { repo, prediksi, konfigurasi, logger } = ctx;

  async function catatInferensi(rec) {
    try {
      await repo.catatInferensi(rec);
    } catch (e) {
      logger.warn(`[risiko] gagal mencatat riwayat_inferensi batch ${rec.batch_id}: ${e.message}`);
    }
  }

  /**
   * Hitung skor satu batch (baris gabungan dari repo) dan simpan hasilnya.
   * Mengembalikan { skor_risiko, status_risiko, keterangan, sumber }.
   */
  async function hitungDanSimpan(batch, pengaturan) {
    const fitur = risiko.bangunFiturModel(batch, {
      tanggalAcuan: pengaturan.tanggal_acuan,
      aturanReturBulan: retur.bulanAturan(batch.aturan_retur_bulan, konfigurasi),
    });

    let hasil;
    try {
      const respons = await prediksi.prediksi(fitur);
      const { skor_risiko, status_risiko } = risiko.bacaResponsPrediksi(respons, konfigurasi);
      hasil = { skor_risiko, status_risiko, keterangan: null, sumber: prediksi.nama || 'prediksi' };
      await catatInferensi({ batch_id: batch.id, skor_risiko, status: 'sukses', input_features: fitur, response_raw: respons });
    } catch (e) {
      const status = e && e.jenis === 'timeout' ? 'timeout' : 'gagal';
      logger.warn(`[risiko] prediksi batch ${batch.id} ${status}: ${e && e.message}`);
      await catatInferensi({ batch_id: batch.id, skor_risiko: null, status, input_features: fitur, response_raw: (e && e.respons) || { error: e && e.message } });
      if (konfigurasi.risiko.saatGagal === 'pertahankan' && batch.skor_risiko !== null && batch.skor_risiko !== undefined) {
        return { skor_risiko: Number(batch.skor_risiko), status_risiko: batch.status_risiko, keterangan: batch.keterangan ?? null, sumber: 'skor_lama' };
      }
      hasil = { skor_risiko: null, status_risiko: risiko.STATUS_RISIKO.BELUM, keterangan: risiko.KETERANGAN_BELUM, sumber: 'fallback' };
    }

    try {
      await repo.perbaruiBatch(batch.id, {
        skor_risiko: hasil.skor_risiko,
        status_risiko: hasil.status_risiko,
        keterangan: hasil.keterangan,
      });
    } catch (e) {
      logger.error(`[risiko] gagal menyimpan skor batch ${batch.id}: ${e.message}`);
    }
    return hasil;
  }

  /** Hitung ulang skor beberapa batch dengan batas paralel. */
  async function hitungUlang({ ids, hanyaBelumTersedia = false } = {}) {
    const pengaturan = await ctx.pengaturan.ambil();
    let batches = await repo.daftarBatch({ ids, hanya_aktif: true });
    if (hanyaBelumTersedia) {
      batches = batches.filter((b) => b.skor_risiko === null || b.skor_risiko === undefined || b.status_risiko === risiko.STATUS_RISIKO.BELUM);
    }
    const ringkas = { diproses: 0, sukses: 0, fallback: 0 };
    const antre = [...batches];
    const pekerja = Array.from({ length: Math.min(konfigurasi.risiko.paralelMaks, antre.length) }, async () => {
      while (antre.length) {
        const b = antre.shift();
        const h = await hitungDanSimpan(b, pengaturan);
        ringkas.diproses += 1;
        if (h.sumber === 'fallback' || h.sumber === 'skor_lama') ringkas.fallback += 1;
        else ringkas.sukses += 1;
      }
    });
    await Promise.all(pekerja);
    return ringkas;
  }

  return { hitungDanSimpan, hitungUlang };
}

module.exports = { buatLayananRisiko };
