'use strict';

const tgl = require('../lib/tanggal');

/** Status retur yang dipakai frontend saat ini (lihat docs/TRIAGE_12_KOMENTAR.md #11). */
const STATUS_RETUR = Object.freeze({
  BISA: 'bisa_diretur',
  LEWAT: 'lewat_batas',
  TIDAK_BISA: 'tidak_bisa_diretur', // distributor aturan 0 bulan [A-15]
  SUDAH: 'sudah_diretur',
  DIBUANG: 'dibuang',
});

const STATUS_TERMINAL = new Set([STATUS_RETUR.SUDAH, STATUS_RETUR.DIBUANG]);

/**
 * Batas retur = tanggal_kedaluwarsa - N bulan.  N = 0 => tidak bisa diretur (null).
 * Contoh TC-REM-001: ('2027-06-01', 3) => '2027-03-01'.
 */
function hitungBatasRetur(tanggalKedaluwarsa, bulanAturan) {
  const n = Number(bulanAturan);
  if (!Number.isFinite(n) || n <= 0) return null;
  return tgl.tambahBulan(tanggalKedaluwarsa, -Math.trunc(n));
}

/** Ambil N bulan dari baris aturan; kalau distributor belum punya aturan, pakai default. */
function bulanAturan(aturan, konfigurasi) {
  if (aturan === null || aturan === undefined) return konfigurasi.retur.bulanDefault;
  if (typeof aturan === 'number') return aturan;
  const n = aturan.bulan_sebelum_kedaluwarsa ?? aturan.aturan_retur_bulan;
  return n === null || n === undefined ? konfigurasi.retur.bulanDefault : Number(n);
}

function batchAktif(batch) {
  if (!batch) return false;
  return Number(batch.jumlah_saat_ini ?? 0) > 0 && !STATUS_TERMINAL.has(batch.status_retur) && batch.status_batch !== 'dibuang';
}

/**
 * Status retur efektif relatif ke tanggal acuan.
 * Hari H batas retur masih 'bisa_diretur'; mulai H+1 'lewat_batas'.
 */
function tentukanStatusRetur(batch, tanggalAcuan) {
  if (STATUS_TERMINAL.has(batch.status_retur)) return batch.status_retur;
  if (!batch.batas_retur) return STATUS_RETUR.TIDAK_BISA;
  const sisa = tgl.selisihHari(batch.batas_retur, tanggalAcuan);
  if (sisa === null) return STATUS_RETUR.TIDAK_BISA;
  return sisa < 0 ? STATUS_RETUR.LEWAT : STATUS_RETUR.BISA;
}

/**
 * Hitung kolom turunan retur untuk satu batch (dipakai saat batch baru,
 * aturan retur berubah, atau tanggal acuan berubah).
 */
function hitungKolomRetur(batch, aturan, tanggalAcuan, konfigurasi) {
  const n = bulanAturan(aturan, konfigurasi);
  const batas_retur = hitungBatasRetur(batch.tanggal_kedaluwarsa, n);
  const status_retur = tentukanStatusRetur({ ...batch, batas_retur }, tanggalAcuan);
  return { batas_retur, status_retur, aturan_retur_bulan: n };
}

module.exports = {
  STATUS_RETUR,
  STATUS_TERMINAL,
  hitungBatasRetur,
  bulanAturan,
  batchAktif,
  tentukanStatusRetur,
  hitungKolomRetur,
};
