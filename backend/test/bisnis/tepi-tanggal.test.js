'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const tgl = require('../../src/bisnis/lib/tanggal');
const retur = require('../../src/bisnis/domain/retur');
const inventori = require('../../src/bisnis/domain/inventori');
const pengingat = require('../../src/bisnis/domain/pengingat');
const { buatKonfigurasi } = require('../../src/bisnis/config/default');
const { siapkan } = require('../../test-support/fixture');

const K = buatKonfigurasi();

function buatRow(timpa = {}) {
  return {
    id: 1,
    obat_id: 1,
    kode_obat: 'OBT-001',
    nama_obat: 'Amoxicillin 500mg',
    kategori: 'Antibiotik',
    satuan: 'strip',
    stok_minimum: 10,
    distributor_id: 2,
    kode_distributor: 'DST-002',
    nama_distributor: 'PBF Dua',
    telepon_distributor: '0812',
    aturan_retur_bulan: 3,
    nomor_batch: 'B-EDGE-01',
    tanggal_masuk: '2026-01-01',
    tanggal_kedaluwarsa: '2027-01-31',
    batas_retur: '2026-10-31',
    jumlah_awal: 50,
    jumlah_saat_ini: 25,
    harga_beli_satuan: '10000.00',
    skor_risiko: 0.4,
    status_risiko: 'rendah',
    status_retur: 'bisa_diretur',
    ...timpa,
  };
}

// ---------------- 31 Januari & penjepitan akhir bulan ----------------

test('tepi tanggal: 31 Januari dikurangi 1, 2, 3, dan 6 bulan', () => {
  assert.equal(tgl.tambahBulan('2027-01-31', -1), '2026-12-31');
  assert.equal(tgl.tambahBulan('2027-01-31', -2), '2026-11-30'); // dijepit ke 30 Nov
  assert.equal(tgl.tambahBulan('2027-01-31', -3), '2026-10-31');
  assert.equal(tgl.tambahBulan('2027-01-31', -6), '2026-07-31');
  assert.equal(retur.hitungBatasRetur('2027-01-31', 1), '2026-12-31');
  assert.equal(retur.hitungBatasRetur('2027-01-31', 3), '2026-10-31');
  assert.equal(retur.hitungBatasRetur('2027-01-31', 6), '2026-07-31');
});

test('tepi tanggal: 31 Januari ditambah 1 bulan & akhir bulan lain dijepit', () => {
  assert.equal(tgl.tambahBulan('2027-01-31', 1), '2027-02-28'); // non-kabisat
  assert.equal(tgl.tambahBulan('2028-01-31', 1), '2028-02-29'); // kabisat
  assert.equal(retur.hitungBatasRetur('2027-05-31', 1), '2027-04-30');
  assert.equal(retur.hitungBatasRetur('2027-07-31', 1), '2027-06-30');
  assert.equal(retur.hitungBatasRetur('2027-10-31', 1), '2027-09-30');
  assert.equal(retur.hitungBatasRetur('2027-12-31', 1), '2027-11-30');
  assert.equal(retur.hitungBatasRetur('2027-03-31', 6), '2026-09-30');
});

// ---------------- 29 Februari tahun kabisat ----------------

test('tepi tanggal: validasi 29 Februari kabisat vs non-kabisat dan aturan abad', () => {
  assert.equal(tgl.valid('2024-02-29'), true);
  assert.equal(tgl.valid('2028-02-29'), true);
  assert.equal(tgl.valid('2000-02-29'), true); // kelipatan 400 = kabisat
  assert.equal(tgl.valid('2026-02-29'), false);
  assert.equal(tgl.valid('2027-02-29'), false);
  assert.equal(tgl.valid('2100-02-29'), false); // kelipatan 100 bukan 400 = bukan kabisat
  assert.equal(tgl.normalisasi('2028-02-29'), '2028-02-29');
  assert.equal(tgl.normalisasi('2027-02-29'), null);
});

test('tepi tanggal: operasi tambahBulan & hitungBatasRetur dari dan menuju 29 Februari kabisat', () => {
  assert.equal(tgl.tambahBulan('2028-02-29', -1), '2028-01-29');
  assert.equal(tgl.tambahBulan('2028-02-29', -3), '2027-11-29');
  assert.equal(tgl.tambahBulan('2028-02-29', -6), '2027-08-29');
  assert.equal(tgl.tambahBulan('2028-02-29', -12), '2027-02-28'); // mundur 1 tahun ke non-kabisat
  assert.equal(tgl.tambahBulan('2028-02-29', 12), '2029-02-28'); // maju 1 tahun ke non-kabisat

  // Tanggal 31 yang jatuh ke Februari tahun kabisat harus dijepit ke 29 Feb (bukan 28 Feb)
  assert.equal(retur.hitungBatasRetur('2028-03-31', 1), '2028-02-29');
  assert.equal(retur.hitungBatasRetur('2028-05-31', 3), '2028-02-29');
  assert.equal(retur.hitungBatasRetur('2028-08-31', 6), '2028-02-29');
});

test('tepi tanggal: selisihHari dan pengingat pada tanggal acuan 29 Februari 2028', () => {
  assert.equal(tgl.selisihHari('2028-03-01', '2028-02-28'), 2); // melewati 29 Feb
  assert.equal(tgl.selisihHari('2027-03-01', '2027-02-28'), 1); // non-kabisat
  assert.equal(tgl.selisihHari('2028-02-29', '2028-02-28'), 1);
  assert.equal(tgl.selisihHari('2028-03-01', '2028-02-29'), 1);

  const pengaturanKabisat = {
    ...K.pengaturanAwal,
    tanggal_acuan: '2028-02-29',
  };
  const bHariH = inventori.perkayaBatch(
    buatRow({ id: 10, tanggal_kedaluwarsa: '2028-05-31', batas_retur: '2028-02-29' }),
    pengaturanKabisat,
    K
  );
  const bLewat = inventori.perkayaBatch(
    buatRow({ id: 11, tanggal_kedaluwarsa: '2028-05-28', batas_retur: '2028-02-28' }),
    pengaturanKabisat,
    K
  );

  assert.equal(bHariH.status_retur, 'bisa_diretur');
  assert.equal(bHariH.sisa_hari_retur, 0);
  assert.equal(bLewat.status_retur, 'lewat_batas');
  assert.equal(bLewat.sisa_hari_retur, -1);

  const hasil = pengingat.susunPengingat([bHariH, bLewat], pengaturanKabisat, K);
  assert.equal(hasil.daftar.mendesak_retur.length, 1);
  assert.equal(hasil.daftar.mendesak_retur[0].batch_id, 10);
  assert.equal(hasil.daftar.mendesak_retur[0].urgensi, 'kritis');
  assert.match(hasil.daftar.mendesak_retur[0].pesan_peringatan, /Hari ini batas terakhir retur \(29 Feb 2028\)/);
  assert.equal(hasil.daftar.lewat_batas_retur.length, 1);
  assert.equal(hasil.daftar.lewat_batas_retur[0].batch_id, 11);
});

// ---------------- Pergantian tahun (Desember <-> Januari) ----------------

test('tepi tanggal: pergantian tahun 31 Des -> 1 Jan pada selisihHari dan status retur', () => {
  assert.equal(tgl.selisihHari('2027-01-01', '2026-12-31'), 1);
  assert.equal(tgl.selisihHari('2026-12-31', '2027-01-01'), -1);
  assert.equal(tgl.tambahBulan('2026-12-31', 1), '2027-01-31');
  assert.equal(tgl.tambahBulan('2027-01-01', -1), '2026-12-01');
  assert.ok(tgl.bandingkan('2026-12-31', '2027-01-01') < 0);
  assert.ok(tgl.bandingkan('2027-01-01', '2026-12-31') > 0);

  const batchAkhirTahun = { batas_retur: '2026-12-31', status_retur: 'bisa_diretur' };
  assert.equal(retur.tentukanStatusRetur(batchAkhirTahun, '2026-12-31'), 'bisa_diretur');
  assert.equal(retur.tentukanStatusRetur(batchAkhirTahun, '2027-01-01'), 'lewat_batas');
});

test('tepi tanggal: pengingat dan ubah tanggal acuan melintasi pergantian tahun', async () => {
  const { bisnis, repo } = siapkan({
    data: {
      pengaturan: {
        tanggal_acuan: '2026-12-20',
        stok_minimum_default: '10',
        batas_kedaluwarsa_warning_hari: '90',
        batas_retur_warning_hari: '30',
      },
      distributor: [{ id: 1, kode: 'DST-001', nama: 'PBF Satu' }],
      aturan_retur: [{ id: 1, distributor_id: 1, bulan_sebelum_kedaluwarsa: 1 }],
      obat: [{ id: 1, kode_obat: 'OBT-001', nama_obat: 'Obat Tahun Baru', kategori: 'Umum', satuan: 'strip', stok_minimum: 5 }],
      batch: [
        {
          id: 1,
          obat_id: 1,
          distributor_id: 1,
          nomor_batch: 'B-NY-1',
          tanggal_masuk: '2026-06-01',
          tanggal_kedaluwarsa: '2027-01-31',
          batas_retur: '2026-12-31',
          jumlah_awal: 30,
          jumlah_saat_ini: 20,
          harga_beli_satuan: '5000.00',
          status_retur: 'bisa_diretur',
          skor_risiko: null,
          status_risiko: null,
        },
        {
          id: 2,
          obat_id: 1,
          distributor_id: 1,
          nomor_batch: 'B-NY-2',
          tanggal_masuk: '2026-06-01',
          tanggal_kedaluwarsa: '2027-02-04',
          batas_retur: '2027-01-04',
          jumlah_awal: 30,
          jumlah_saat_ini: 20,
          harga_beli_satuan: '5000.00',
          status_retur: 'bisa_diretur',
          skor_risiko: null,
          status_risiko: null,
        },
      ],
    },
  });

  const p2026 = await bisnis.laporan.daftarPengingat();
  const item2 = p2026.daftar.mendesak_retur.find((i) => i.batch_id === 2);
  assert.ok(item2);
  assert.equal(item2.sisa_hari_retur, 15);
  assert.equal(item2.urgensi, 'kritis');
  assert.match(item2.pesan_peringatan, /15 hari lagi \(4 Jan 2027\)/);

  // Pindah tanggal acuan ke 1 Januari 2027 -> batch 1 (batas 2026-12-31) harus menjadi lewat_batas
  const ubah = await bisnis.pengaturan.ubah({ tanggal_acuan: '2027-01-01' });
  assert.equal(ubah.batch_status_retur_berubah, 1);
  assert.equal((await repo.ambilBatch(1)).status_retur, 'lewat_batas');
  assert.equal((await repo.ambilBatch(2)).status_retur, 'bisa_diretur');
});

// ---------------- Kedaluwarsa hari ini ----------------

test('tepi tanggal: kedaluwarsa hari ini (ED === tanggal_acuan) dianggap sudah kedaluwarsa [A-19]', () => {
  const pengaturan = { ...K.pengaturanAwal, tanggal_acuan: '2026-10-31' };

  const edHariIni = inventori.perkayaBatch(
    buatRow({ id: 20, tanggal_kedaluwarsa: '2026-10-31', batas_retur: '2026-07-31', status_retur: 'lewat_batas' }),
    pengaturan,
    K
  );
  const edBesok = inventori.perkayaBatch(
    buatRow({ id: 21, tanggal_kedaluwarsa: '2026-11-01', batas_retur: '2026-08-01', status_retur: 'lewat_batas' }),
    pengaturan,
    K
  );
  const edKemarin = inventori.perkayaBatch(
    buatRow({ id: 22, tanggal_kedaluwarsa: '2026-10-30', batas_retur: '2026-07-30', status_retur: 'lewat_batas' }),
    pengaturan,
    K
  );

  assert.equal(edHariIni.sisa_hari_exp, 0);
  assert.equal(edHariIni.sudah_kedaluwarsa, true);
  assert.equal(edBesok.sisa_hari_exp, 1);
  assert.equal(edBesok.sudah_kedaluwarsa, false);
  assert.equal(edKemarin.sisa_hari_exp, -1);
  assert.equal(edKemarin.sudah_kedaluwarsa, true);

  const hasil = pengingat.susunPengingat([edHariIni, edBesok], pengaturan, K);
  const lewatHariIni = hasil.daftar.lewat_batas_retur.find((i) => i.batch_id === 20);
  const lewatBesok = hasil.daftar.lewat_batas_retur.find((i) => i.batch_id === 21);
  assert.equal(lewatHariIni.urgensi, 'kritis');
  assert.equal(lewatHariIni.aksi_disarankan, 'catat_dibuang');
  assert.equal(lewatBesok.urgensi, 'waspada');
  assert.equal(lewatBesok.aksi_disarankan, 'prioritas_jual');

  const dekatHariIni = hasil.daftar.mendekati_kedaluwarsa.find((i) => i.batch_id === 20);
  assert.equal(dekatHariIni.urgensi, 'kritis');
  assert.equal(dekatHariIni.sudah_kedaluwarsa, true);
  assert.match(dekatHariIni.pesan_peringatan, /Obat sudah kedaluwarsa \(31 Okt 2026\)/);
});

test('tepi tanggal: batch konsinyasi (aturan 0 bulan) kedaluwarsa hari ini tetap masuk pengingat ED', () => {
  const pengaturan = { ...K.pengaturanAwal, tanggal_acuan: '2026-10-31' };
  const konsinyasi = inventori.perkayaBatch(
    buatRow({
      id: 30,
      distributor_id: 3,
      aturan_retur_bulan: 0,
      tanggal_kedaluwarsa: '2026-10-31',
      batas_retur: null,
      status_retur: 'tidak_bisa_diretur',
    }),
    pengaturan,
    K
  );

  const hasil = pengingat.susunPengingat([konsinyasi], pengaturan, K);
  assert.equal(hasil.daftar.bisa_diretur.length, 0);
  assert.equal(hasil.daftar.mendesak_retur.length, 0);
  assert.equal(hasil.daftar.lewat_batas_retur.length, 0);
  assert.equal(hasil.daftar.mendekati_kedaluwarsa.length, 1);
  assert.equal(hasil.daftar.mendekati_kedaluwarsa[0].sudah_kedaluwarsa, true);
  assert.equal(hasil.daftar.mendekati_kedaluwarsa[0].urgensi, 'kritis');
});

test('tepi tanggal: batchMasuk.siapkan menolak ED H-1 (TC-INP-007) dan memeriksa ED hari ini', async () => {
  const { bisnis } = siapkan();

  // H-1 terhadap tanggal acuan 2026-10-31 harus ditolak
  await assert.rejects(
    bisnis.batchMasuk.siapkan({
      distributor_id: 2,
      tanggal_masuk: '2026-10-30',
      items: [{ obat_id: 1, nomor_batch: 'ED-KEMARIN', tanggal_kedaluwarsa: '2026-10-30', jumlah: 10, harga_beli_satuan: 1000 }],
    }),
    (e) => e.status === 400 && e.detail.some((d) => d.field === 'items[0].tanggal_kedaluwarsa')
  );

  // H+1 terhadap tanggal acuan diterima
  const besok = await bisnis.batchMasuk.siapkan({
    distributor_id: 2,
    tanggal_masuk: '2026-10-31',
    items: [{ obat_id: 1, nomor_batch: 'ED-BESOK', tanggal_kedaluwarsa: '2026-11-01', jumlah: 10, harga_beli_satuan: 1000 }],
  });
  assert.equal(besok.baris[0].tanggal_kedaluwarsa, '2026-11-01');
  assert.equal(besok.baris[0].batas_retur, '2026-08-01');
  assert.equal(besok.baris[0].status_retur, 'lewat_batas');

  // ED hari ini (2026-10-31): di domain inventori [A-19] sudah dianggap kedaluwarsa,
  // di batchMasuk.siapkan cek konsistensi apakah diterima atau ditolak
  const hariIni = await bisnis.batchMasuk.siapkan({
    distributor_id: 2,
    tanggal_masuk: '2026-10-31',
    items: [{ obat_id: 1, nomor_batch: 'ED-HARI-INI', tanggal_kedaluwarsa: '2026-10-31', jumlah: 10, harga_beli_satuan: 1000 }],
  });
  assert.equal(hariIni.baris[0].tanggal_kedaluwarsa, '2026-10-31');
  assert.equal(hariIni.baris[0].batas_retur, '2026-07-31');
  assert.equal(hariIni.baris[0].status_retur, 'lewat_batas');
});
