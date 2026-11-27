'use strict';

const tgl = require('../lib/tanggal');
const { STATUS_RETUR } = require('./retur');

const STATUS_RISIKO = Object.freeze({
  RENDAH: 'rendah',
  SEDANG: 'sedang',
  TINGGI: 'tinggi',
  BELUM: 'belum_tersedia',
});
const LABEL_VALID = new Set([STATUS_RISIKO.RENDAH, STATUS_RISIKO.SEDANG, STATUS_RISIKO.TINGGI]);
const KETERANGAN_BELUM = 'Skor belum tersedia';

function labelDariSkor(skor, konfigurasi) {
  if (skor === null || skor === undefined || Number.isNaN(Number(skor))) return STATUS_RISIKO.BELUM;
  const s = Number(skor);
  if (s >= konfigurasi.risiko.ambangTinggi) return STATUS_RISIKO.TINGGI;
  if (s >= konfigurasi.risiko.ambangSedang) return STATUS_RISIKO.SEDANG;
  return STATUS_RISIKO.RENDAH;
}

/**
 * Fitur input model, sesuai contoh request docs/03-API-Contract.md §9.1.
 * [A-16] Daftar & rumus fitur WAJIB dicocokkan dengan Fachri/Umar sebelum integrasi.
 * Kalau berubah, cukup ubah fungsi ini.
 */
function bangunFiturModel(batch, { tanggalAcuan, aturanReturBulan }) {
  const jumlahAwal = Number(batch.jumlah_awal);
  const jumlahSaatIni = Number(batch.jumlah_saat_ini);
  return {
    batch_id: batch.id,
    distributor_id: batch.distributor_id,
    jumlah_awal: jumlahAwal,
    jumlah_saat_ini: jumlahSaatIni,
    harga_beli_satuan: Number(batch.harga_beli_satuan),
    sisa_hari_ke_kedaluwarsa: tgl.selisihHari(batch.tanggal_kedaluwarsa, tanggalAcuan),
    // null kalau distributor tidak menerima retur [A-17]
    sisa_hari_ke_batas_retur: batch.batas_retur ? tgl.selisihHari(batch.batas_retur, tanggalAcuan) : null,
    aturan_retur_bulan: Number(aturanReturBulan),
    rasio_stok_tersisa: jumlahAwal > 0 ? Number((jumlahSaatIni / jumlahAwal).toFixed(4)) : 0,
  };
}

/** Validasi dan ambil skor dari respons layanan prediksi. Melempar kalau bentuknya salah. */
function bacaResponsPrediksi(respons, konfigurasi) {
  const skor = Number(respons && respons.skor_risiko);
  if (!respons || respons.skor_risiko === null || respons.skor_risiko === undefined || !Number.isFinite(skor) || skor < 0 || skor > 1) {
    throw new Error('Respons prediksi tidak berisi skor_risiko 0..1');
  }
  const skorBulat = Number(skor.toFixed(4)); // DECIMAL(5,4)
  const dariModel = respons.kategori_risiko;
  const status_risiko =
    konfigurasi.risiko.sumberLabel === 'model' && LABEL_VALID.has(dariModel)
      ? dariModel
      : labelDariSkor(skorBulat, konfigurasi);
  return { skor_risiko: skorBulat, status_risiko };
}

/**
 * Aturan tampil triage #12: batch 'lewat_batas' tidak boleh berlabel 'Risiko Tinggi'
 * sekaligus. Nilai asli dari model TIDAK diubah di DB; ini hanya label tampilan. [A-18]
 */
function statusRisikoTampil(statusRisiko, statusRetur) {
  if (statusRetur === STATUS_RETUR.LEWAT && statusRisiko === STATUS_RISIKO.TINGGI) return STATUS_RISIKO.SEDANG;
  return statusRisiko || STATUS_RISIKO.BELUM;
}

module.exports = {
  STATUS_RISIKO,
  KETERANGAN_BELUM,
  labelDariSkor,
  bangunFiturModel,
  bacaResponsPrediksi,
  statusRisikoTampil,
};
