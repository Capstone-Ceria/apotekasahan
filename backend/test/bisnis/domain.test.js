'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const tgl = require('../../src/bisnis/lib/tanggal');
const uang = require('../../src/bisnis/lib/uang');
const retur = require('../../src/bisnis/domain/retur');
const risiko = require('../../src/bisnis/domain/risiko');
const { buatKonfigurasi } = require('../../src/bisnis/config/default');

const K = buatKonfigurasi();

test('tanggal: kurang bulan dengan akhir bulan dijepit', () => {
  assert.equal(tgl.tambahBulan('2027-03-31', -1), '2027-02-28');
  assert.equal(tgl.tambahBulan('2028-03-31', -1), '2028-02-29'); // kabisat
  assert.equal(tgl.tambahBulan('2027-01-15', -3), '2026-10-15'); // lintas tahun
  assert.equal(tgl.tambahBulan('2027-08-31', -6), '2027-02-28');
});

test('tanggal: selisih hari dan validasi', () => {
  assert.equal(tgl.selisihHari('2026-11-15', '2026-10-31'), 15);
  assert.equal(tgl.selisihHari('2026-10-30', '2026-10-31'), -1);
  assert.equal(tgl.selisihHari('2027-03-28', '2027-03-27'), 1);
  assert.equal(tgl.valid('2026-02-30'), false);
  assert.equal(tgl.valid('2026-13-01'), false);
  assert.equal(tgl.normalisasi('2026-10-31T17:00:00.000Z'), '2026-10-31');
});

test('uang: sen dari string DECIMAL tanpa galat pembulatan', () => {
  assert.equal(uang.keSen('42000.00'), 4200000);
  assert.equal(uang.keSen('0.10'), 10);
  assert.equal(uang.keSen('1500.105'), 150011);
  assert.equal(uang.keSen(18500), 1850000);
  // 3 x 0.10 harus 0.30 persis
  assert.equal(uang.dariSen(uang.nilaiBatchSen(3, '0.10')), 0.3);
});

test('TC-REM-001: ED 2027-06-01, aturan 3 bulan => batas retur 2027-03-01', () => {
  assert.equal(retur.hitungBatasRetur('2027-06-01', 3), '2027-03-01');
});

test('batas retur untuk aturan 0, 1, 3, 6 bulan', () => {
  assert.equal(retur.hitungBatasRetur('2027-06-01', 0), null);
  assert.equal(retur.hitungBatasRetur('2027-06-01', 1), '2027-05-01');
  assert.equal(retur.hitungBatasRetur('2027-06-01', 3), '2027-03-01');
  assert.equal(retur.hitungBatasRetur('2027-06-01', 6), '2026-12-01');
});

test('status retur H-1, H, H+1 terhadap tanggal acuan', () => {
  const batch = { batas_retur: '2026-10-31', status_retur: 'bisa_diretur' };
  assert.equal(retur.tentukanStatusRetur(batch, '2026-10-30'), 'bisa_diretur'); // H-1
  assert.equal(retur.tentukanStatusRetur(batch, '2026-10-31'), 'bisa_diretur'); // H
  assert.equal(retur.tentukanStatusRetur(batch, '2026-11-01'), 'lewat_batas'); // H+1
});

test('status retur: aturan 0 => tidak_bisa_diretur, status terminal dipertahankan', () => {
  assert.equal(retur.tentukanStatusRetur({ batas_retur: null }, '2026-10-31'), 'tidak_bisa_diretur');
  assert.equal(retur.tentukanStatusRetur({ batas_retur: '2027-01-01', status_retur: 'sudah_diretur' }, '2026-10-31'), 'sudah_diretur');
  assert.equal(retur.tentukanStatusRetur({ batas_retur: '2026-01-01', status_retur: 'dibuang' }, '2026-10-31'), 'dibuang');
});

test('distributor tanpa aturan memakai default 6 bulan', () => {
  const k = retur.hitungKolomRetur({ tanggal_kedaluwarsa: '2027-10-01' }, null, '2026-10-31', K);
  assert.deepEqual(k, { batas_retur: '2027-04-01', status_retur: 'bisa_diretur', aturan_retur_bulan: 6 });
});

test('label risiko dari ambang', () => {
  assert.equal(risiko.labelDariSkor(0.75, K), 'tinggi');
  assert.equal(risiko.labelDariSkor(0.7499, K), 'sedang');
  assert.equal(risiko.labelDariSkor(0.5, K), 'sedang');
  assert.equal(risiko.labelDariSkor(0.1, K), 'rendah');
  assert.equal(risiko.labelDariSkor(null, K), 'belum_tersedia');
  const K2 = buatKonfigurasi({ risiko: { ambangTinggi: 0.9 } });
  assert.equal(risiko.labelDariSkor(0.8, K2), 'sedang');
  assert.equal(K2.risiko.ambangSedang, 0.5); // override sebagian tidak menghapus nilai lain
});

test('respons prediksi: skor di luar 0..1 ditolak, kategori model dipakai bila valid', () => {
  assert.throws(() => risiko.bacaResponsPrediksi({ skor_risiko: 1.2 }, K));
  assert.throws(() => risiko.bacaResponsPrediksi({}, K));
  assert.deepEqual(risiko.bacaResponsPrediksi({ skor_risiko: 0.81456, kategori_risiko: 'sedang' }, K), { skor_risiko: 0.8146, status_risiko: 'sedang' });
  const Kambang = buatKonfigurasi({ risiko: { sumberLabel: 'ambang' } });
  assert.equal(risiko.bacaResponsPrediksi({ skor_risiko: 0.8, kategori_risiko: 'sedang' }, Kambang).status_risiko, 'tinggi');
});

test('fitur model sesuai contoh kontrak §9.1', () => {
  const f = risiko.bangunFiturModel(
    { id: 102, distributor_id: 3, jumlah_awal: 50, jumlah_saat_ini: 50, harga_beli_satuan: '42000.00', tanggal_kedaluwarsa: '2027-10-14', batas_retur: '2027-04-14' },
    { tanggalAcuan: '2026-10-31', aturanReturBulan: 6 }
  );
  assert.deepEqual(Object.keys(f).sort(), [
    'aturan_retur_bulan', 'batch_id', 'distributor_id', 'harga_beli_satuan', 'jumlah_awal', 'jumlah_saat_ini',
    'rasio_stok_tersisa', 'sisa_hari_ke_batas_retur', 'sisa_hari_ke_kedaluwarsa',
  ]);
  assert.equal(f.sisa_hari_ke_kedaluwarsa, 348);
  assert.equal(f.sisa_hari_ke_batas_retur, 165);
  assert.equal(f.rasio_stok_tersisa, 1);
  assert.equal(f.harga_beli_satuan, 42000);
});

test('triage #12: lewat batas tidak pernah tampil Risiko Tinggi', () => {
  assert.equal(risiko.statusRisikoTampil('tinggi', 'lewat_batas'), 'sedang');
  assert.equal(risiko.statusRisikoTampil('tinggi', 'bisa_diretur'), 'tinggi');
  assert.equal(risiko.statusRisikoTampil(null, 'bisa_diretur'), 'belum_tersedia');
});
