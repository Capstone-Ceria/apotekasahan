'use strict';

/**
 * SEMUA angka/aturan yang masih ASUMSI dikumpulkan di sini.
 * Kalau Charlene, PIC (Bu Anni), atau tim model memutuskan lain,
 * cukup ubah nilai di file ini (atau timpa lewat buatKonfigurasi({...}))
 * tanpa menyentuh rumus di folder domain/.
 *
 * Kode [A-xx] merujuk ke docs/ASUMSI-LOGIKA-BISNIS.md.
 */
const KONFIGURASI_DEFAULT = Object.freeze({
  // Nilai awal tabel `pengaturan` (sesuai docs/02-Desain-Database.md §3.8).
  // Dipakai kalau barisnya belum ada di DB.
  pengaturanAwal: Object.freeze({
    tanggal_acuan: '2026-10-31', // [A-01]
    stok_minimum_default: 10,
    batas_kedaluwarsa_warning_hari: 90,
    batas_retur_warning_hari: 30,
  }),

  retur: Object.freeze({
    // [A-02] Batas retur = tanggal_kedaluwarsa dikurangi N bulan.
    // [A-03] Distributor tanpa baris aturan_retur dianggap memakai nilai ini.
    bulanDefault: 6,
    // [A-04] Pilihan yang boleh diisi admin. 0 = tidak menerima retur.
    pilihanBulan: Object.freeze([0, 1, 3, 6]),
    // [A-05] Kalau tanggal hasil pengurangan tidak ada (31 Mar - 1 bln),
    // dipakai tanggal terakhir bulan itu (28/29 Feb).
    // Pada hari H batas retur, batch MASIH bisa diretur (lewat_batas mulai H+1).
  }),

  risiko: Object.freeze({
    // [A-06] Ambang label risiko dari skor 0..1. Perlu kalibrasi Fachri/Umar.
    ambangTinggi: 0.75,
    ambangSedang: 0.5,
    // [A-07] 'model' = pakai kategori_risiko dari FastAPI bila ada & valid,
    // jatuh ke ambang di atas kalau tidak ada. 'ambang' = selalu pakai ambang backend.
    sumberLabel: 'model',
    // [A-08] Saat prediksi gagal setelah stok berubah: 'kosongkan' skor lama
    // (status 'belum_tersedia') atau 'pertahankan' skor lama.
    saatGagal: 'kosongkan',
    // [A-09] Fitur model dihitung relatif ke tanggal acuan, jadi skor dihitung
    // ulang saat tanggal acuan / aturan retur berubah.
    hitungUlangSaatTanggalAcuanBerubah: true,
    hitungUlangSaatAturanReturBerubah: true,
    paralelMaks: 5,
  }),

  prediksi: Object.freeze({
    // [A-10] Kontrak docs/03-API-Contract.md §9.1
    path: '/predict-risk',
    timeoutMs: 5000,
  }),

  pengingat: Object.freeze({
    // [A-11] 'per_batch' (seperti frontend & triage #11) atau 'per_obat'
    // (total semua batch aktif satu obat, seperti docs/02 §3.4).
    modeStokMenipis: 'per_batch',
    // [A-12] Ambang urgensi visual untuk daftar retur & ED.
    hariKritisRetur: 15,
    hariKritisKedaluwarsa: 30,
  }),

  dashboard: Object.freeze({
    // [A-13] Batch dihitung "berisiko" bila status_risiko tinggi ATAU sudah lewat batas retur.
    berisikoJikaLewatBatas: true,
    topDistributor: 5,
    maksTindakanSegera: 10,
  }),

  penyesuaian: Object.freeze({
    // [A-14] Batch yang sudah diretur/dibuang tidak boleh diopname ulang.
    tolakBatchNonAktif: true,
  }),
});

function gabung(dasar, timpa) {
  if (!timpa) return dasar;
  const hasil = { ...dasar };
  for (const [k, v] of Object.entries(timpa)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && dasar[k] && typeof dasar[k] === 'object') {
      hasil[k] = gabung(dasar[k], v);
    } else if (v !== undefined) {
      hasil[k] = v;
    }
  }
  return hasil;
}

/** Buat konfigurasi akhir: default + override (mis. dari env). */
function buatKonfigurasi(timpa = {}) {
  return gabung(KONFIGURASI_DEFAULT, timpa);
}

module.exports = { KONFIGURASI_DEFAULT, buatKonfigurasi };
