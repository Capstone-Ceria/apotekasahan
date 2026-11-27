'use strict';

const { galat } = require('../lib/galat');
const retur = require('./retur');
const uang = require('../lib/uang');

/**
 * Rencana penyesuaian stok dari cek fisik (fungsi murni, belum menyentuh DB).
 * Mengembalikan baris log untuk tabel penyesuaian_stok dan field batch yang berubah.
 */
function rencanakanPenyesuaian(batch, { jumlah_sesudah, alasan, user_id }, konfigurasi) {
  if (!batch) throw galat.tidakDitemukan('Batch tidak ditemukan');
  const sesudah = Number(jumlah_sesudah);
  if (!Number.isInteger(sesudah) || sesudah < 0) {
    throw galat.logika('ERR_INVALID_STOCK_VALUE', 'Jumlah stok fisik sesudah penyesuaian tidak boleh kurang dari 0');
  }
  if (konfigurasi.penyesuaian.tolakBatchNonAktif && retur.STATUS_TERMINAL.has(batch.status_retur)) {
    throw galat.logika('ERR_BATCH_TIDAK_AKTIF', `Batch berstatus ${batch.status_retur} tidak bisa disesuaikan`);
  }
  const sebelum = Number(batch.jumlah_saat_ini);
  return {
    log: {
      batch_id: batch.id,
      jumlah_sebelum: sebelum,
      jumlah_sesudah: sesudah,
      selisih: sesudah - sebelum,
      alasan: alasan ? String(alasan).trim() : null,
      user_id,
    },
    perubahanBatch: {
      jumlah_saat_ini: sesudah,
      nilai_total: uang.dariSen(uang.nilaiBatchSen(sesudah, batch.harga_beli_satuan)),
    },
  };
}

module.exports = { rencanakanPenyesuaian };
