'use strict';

const { buatBisnis, buatRepoMemori, buatKlienStub } = require('../src/bisnis');

/**
 * Data uji kecil. Tanggal acuan 2026-10-31.
 * D1 aturan 6 bln, D2 aturan 3 bln, D3 aturan 0 (tidak terima retur), D4 belum punya aturan (=> default 6).
 */
function dataAwal() {
  return {
    pengaturan: {
      tanggal_acuan: '2026-10-31',
      stok_minimum_default: '10',
      batas_kedaluwarsa_warning_hari: '90',
      batas_retur_warning_hari: '30',
    },
    pengguna: [
      { id: 1, nama: 'Admin Apotek', role: 'admin' },
      { id: 2, nama: 'Karyawan', role: 'karyawan' },
    ],
    distributor: [
      { id: 1, kode: 'DST-001', nama: 'PBF Satu', telepon: '0811' },
      { id: 2, kode: 'DST-002', nama: 'PBF Dua' },
      { id: 3, kode: 'DST-003', nama: 'PBF Konsinyasi' },
      { id: 4, kode: 'DST-004', nama: 'PBF Tanpa Aturan' },
    ],
    aturan_retur: [
      { id: 1, distributor_id: 1, bulan_sebelum_kedaluwarsa: 6 },
      { id: 2, distributor_id: 2, bulan_sebelum_kedaluwarsa: 3 },
      { id: 3, distributor_id: 3, bulan_sebelum_kedaluwarsa: 0 },
    ],
    obat: [
      { id: 1, kode_obat: 'OBT-001', nama_obat: 'Amoxicillin 500mg', kategori: 'Antibiotik', satuan: 'strip', stok_minimum: 10 },
      { id: 2, kode_obat: 'OBT-002', nama_obat: 'Paracetamol Sirup', kategori: 'Analgesik', satuan: 'botol', stok_minimum: 5 },
    ],
    batch: [
      // 1: D2, batas retur 2026-11-15 (15 hari lagi) -> mendesak retur
      b(1, 1, 2, 'A-MENDESAK', '2027-02-15', 40, 20, '1500.10', 'bisa_diretur'),
      // 2: D1, batas retur 2026-08-20 -> lewat batas, ED 2027-02-20 (> 90 hari)
      b(2, 1, 1, 'A-LEWAT', '2027-02-20', 30, 12, '2000.00', 'lewat_batas', 0.9, 'tinggi'),
      // 3: D3 konsinyasi, ED 2026-11-20 (20 hari) -> dekat ED, tidak pernah di daftar retur
      b(3, 2, 3, 'P-KONS', '2026-11-20', 10, 8, '18500.00', 'tidak_bisa_diretur'),
      // 4: D1, batas retur jauh (2027-06-01), stok 3 -> stok menipis (min obat 2 = 5)
      b(4, 2, 1, 'P-TIPIS', '2027-12-01', 24, 3, '18500.00', 'bisa_diretur', 0.2, 'rendah'),
      // 5: sudah diretur -> tidak boleh muncul di mana pun
      b(5, 1, 2, 'A-RETUR', '2026-12-01', 10, 0, '1500.00', 'sudah_diretur'),
      // 6: D4 tanpa aturan -> default 6 bln, ED 2027-10-01 -> batas 2027-04-01
      b(6, 1, 4, 'A-DEFAULT', '2027-10-01', 50, 50, '0.10', 'bisa_diretur'),
    ],
  };
}

function b(id, obat_id, distributor_id, nomor_batch, ed, awal, kini, harga, status_retur, skor = null, status_risiko = null) {
  const bulan = { 1: 6, 2: 3, 3: 0, 4: 6 }[distributor_id];
  let batas = null;
  if (bulan > 0) {
    const [y, m, d] = ed.split('-').map(Number);
    batas = new Date(Date.UTC(y, m - 1 - bulan, d)).toISOString().slice(0, 10);
  }
  return {
    id, obat_id, distributor_id, nomor_batch,
    tanggal_kedaluwarsa: ed, tanggal_masuk: '2025-12-01',
    jumlah_awal: awal, jumlah_saat_ini: kini, harga_beli_satuan: harga,
    batas_retur: batas, status_retur, skor_risiko: skor, status_risiko,
  };
}

const loggerSenyap = { warn() {}, error() {}, info() {}, log() {} };

function siapkan({ prediksi = buatKlienStub(), konfigurasi, data } = {}) {
  const repo = buatRepoMemori(data || dataAwal());
  const tugasLatar = [];
  const bisnis = buatBisnis({
    repo,
    prediksi,
    konfigurasi,
    logger: loggerSenyap,
    jalankanLatar: (t) => tugasLatar.push(t),
  });
  const jalankanLatar = async () => {
    while (tugasLatar.length) await tugasLatar.shift()();
  };
  return { repo, bisnis, tugasLatar, jalankanLatar };
}

module.exports = { dataAwal, siapkan, loggerSenyap };
