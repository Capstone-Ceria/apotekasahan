'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const tgl = require('../../src/bisnis/lib/tanggal');
const uang = require('../../src/bisnis/lib/uang');
const retur = require('../../src/bisnis/domain/retur');
const risiko = require('../../src/bisnis/domain/risiko');
const { rencanakanPenyesuaian } = require('../../src/bisnis/domain/penyesuaian');
const inventori = require('../../src/bisnis/domain/inventori');
const pengingat = require('../../src/bisnis/domain/pengingat');
const { buatKonfigurasi } = require('../../src/bisnis/config/default');
const { buatBisnis, buatRepoMemori, buatKlienStub } = require('../../src/bisnis');
const { buatRouterBisnis } = require('../../src/bisnis/http/router');
const { siapkan, loggerSenyap } = require('../../test-support/fixture');

const K = buatKonfigurasi();

function buatAppKosong() {
  const repo = buatRepoMemori({});
  const bisnis = buatBisnis({ repo, prediksi: buatKlienStub(), logger: loggerSenyap });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const peran = req.get('X-Peran');
    if (peran) req.user = { id: 1, role: peran };
    next();
  });
  app.use('/api/v1', buatRouterBisnis({ bisnis }));
  return { app, repo, bisnis };
}

// ---------------- lib/tanggal.js ----------------

test('input kosong/null: lib/tanggal normalisasi, valid, dan selisihHari', () => {
  for (const v of [null, undefined, '', '   ', new Date('invalid'), {}, []]) {
    assert.equal(tgl.normalisasi(v), null);
    assert.equal(tgl.valid(v), false);
  }
  assert.equal(tgl.selisihHari(null, '2026-10-31'), null);
  assert.equal(tgl.selisihHari('2026-10-31', null), null);
  assert.equal(tgl.selisihHari('', ''), null);
  assert.equal(tgl.selisihHari(undefined, undefined), null);
});

test('input kosong/null: lib/tanggal tambahBulan dengan tanggal kosong atau bulan undefined/NaN', () => {
  assert.equal(tgl.tambahBulan(null, -1), null);
  assert.equal(tgl.tambahBulan('', -3), null);
  assert.equal(tgl.tambahBulan(undefined, -1), null);
  // Parameter bulan tidak valid (undefined/NaN) seharusnya mengembalikan null, bukan crash RangeError
  assert.equal(tgl.tambahBulan('2027-01-31', undefined), null);
  assert.equal(tgl.tambahBulan('2027-01-31', NaN), null);
});

test('input kosong/null: lib/tanggal bandingkan tidak boleh mengkoersi null menjadi 0 (1970-01-01)', () => {
  assert.equal(tgl.bandingkan(null, '2026-10-31'), null);
  assert.equal(tgl.bandingkan('2026-10-31', null), null);
  assert.equal(tgl.bandingkan('', '2026-10-31'), null);
  assert.equal(tgl.bandingkan('bukan-tanggal', '2026-10-31'), null);
});

// ---------------- lib/uang.js ----------------

test('input kosong/null: lib/uang keSen dan nilaiBatchSen', () => {
  assert.equal(uang.keSen(null), 0);
  assert.equal(uang.keSen(undefined), 0);
  assert.equal(uang.keSen(''), 0);
  assert.equal(uang.keSen('   '), 0);
  assert.throws(() => uang.keSen('abc'));
  assert.throws(() => uang.keSen(NaN));
  assert.equal(uang.nilaiBatchSen(null, 1000), 0);
  assert.equal(uang.nilaiBatchSen(10, null), 0);
  assert.equal(uang.nilaiBatchSen('', ''), 0);
  assert.equal(uang.nilaiBatchSen(0, '42000.00'), 0);
});

// ---------------- domain/retur.js ----------------

test('input kosong/null: domain/retur hitungBatasRetur, bulanAturan, batchAktif, hitungKolomRetur', () => {
  assert.equal(retur.hitungBatasRetur(null, 3), null);
  assert.equal(retur.hitungBatasRetur('', 3), null);
  assert.equal(retur.hitungBatasRetur(undefined, 3), null);
  assert.equal(retur.hitungBatasRetur('2027-06-01', null), null);
  assert.equal(retur.hitungBatasRetur('2027-06-01', undefined), null);
  assert.equal(retur.hitungBatasRetur('2027-06-01', ''), null);
  assert.equal(retur.hitungBatasRetur('2027-06-01', -3), null);

  assert.equal(retur.bulanAturan(null, K), 6);
  assert.equal(retur.bulanAturan(undefined, K), 6);
  assert.equal(retur.bulanAturan({}, K), 6);
  assert.equal(retur.bulanAturan({ bulan_sebelum_kedaluwarsa: null }, K), 6);
  assert.equal(retur.bulanAturan({ bulan_sebelum_kedaluwarsa: 0 }, K), 0);

  assert.equal(retur.batchAktif(null), false);
  assert.equal(retur.batchAktif(undefined), false);
  assert.equal(retur.batchAktif({}), false);

  assert.deepEqual(retur.hitungKolomRetur({ tanggal_kedaluwarsa: null }, 3, '2026-10-31', K), {
    batas_retur: null,
    status_retur: 'tidak_bisa_diretur',
    aturan_retur_bulan: 3,
  });
});

test('input kosong/null: domain/retur tentukanStatusRetur menangani batch null/kosong tanpa TypeError', () => {
  assert.equal(retur.tentukanStatusRetur({}, '2026-10-31'), 'tidak_bisa_diretur');
  assert.equal(retur.tentukanStatusRetur({ batas_retur: '2026-11-01' }, null), 'tidak_bisa_diretur');
  assert.equal(retur.tentukanStatusRetur(null, '2026-10-31'), 'tidak_bisa_diretur');
  assert.equal(retur.tentukanStatusRetur(undefined, '2026-10-31'), 'tidak_bisa_diretur');
});

// ---------------- domain/risiko.js ----------------

test('input kosong/null: domain/risiko labelDariSkor menolak string kosong sebagai belum_tersedia', () => {
  assert.equal(risiko.labelDariSkor(null, K), 'belum_tersedia');
  assert.equal(risiko.labelDariSkor(undefined, K), 'belum_tersedia');
  assert.equal(risiko.labelDariSkor(NaN, K), 'belum_tersedia');
  assert.equal(risiko.labelDariSkor('abc', K), 'belum_tersedia');
  assert.equal(risiko.labelDariSkor('', K), 'belum_tersedia');
  assert.equal(risiko.labelDariSkor('   ', K), 'belum_tersedia');
});

test('input kosong/null: domain/risiko bacaResponsPrediksi menolak null, kosong, dan skor string kosong', () => {
  assert.throws(() => risiko.bacaResponsPrediksi(null, K));
  assert.throws(() => risiko.bacaResponsPrediksi(undefined, K));
  assert.throws(() => risiko.bacaResponsPrediksi({}, K));
  assert.throws(() => risiko.bacaResponsPrediksi({ skor_risiko: null }, K));
  assert.throws(() => risiko.bacaResponsPrediksi({ skor_risiko: '' }, K));
  assert.throws(() => risiko.bacaResponsPrediksi({ skor_risiko: '   ' }, K));
});

test('input kosong/null: domain/risiko bangunFiturModel (jumlah_awal 0, tanggal null) & statusRisikoTampil', () => {
  const f = risiko.bangunFiturModel(
    {
      id: 1,
      distributor_id: 1,
      jumlah_awal: 0,
      jumlah_saat_ini: 0,
      harga_beli_satuan: 0,
      tanggal_kedaluwarsa: null,
      batas_retur: null,
    },
    { tanggalAcuan: '2026-10-31', aturanReturBulan: 0 }
  );
  assert.equal(f.rasio_stok_tersisa, 0);
  assert.equal(f.sisa_hari_ke_kedaluwarsa, null);
  assert.equal(f.sisa_hari_ke_batas_retur, null);

  assert.equal(risiko.statusRisikoTampil(null, null), 'belum_tersedia');
  assert.equal(risiko.statusRisikoTampil('', 'bisa_diretur'), 'belum_tersedia');
  assert.equal(risiko.statusRisikoTampil(undefined, undefined), 'belum_tersedia');
});

// ---------------- domain/penyesuaian.js ----------------

test('input kosong/null: domain/penyesuaian menolak batch null dan jumlah_sesudah null/kosong/undefined', () => {
  const batch = { id: 1, jumlah_saat_ini: 20, harga_beli_satuan: '1000.00', status_retur: 'bisa_diretur' };

  assert.throws(() => rencanakanPenyesuaian(null, { jumlah_sesudah: 5, user_id: 1 }, K), { status: 404 });
  assert.throws(() => rencanakanPenyesuaian(batch, { jumlah_sesudah: undefined, user_id: 1 }, K), { kode: 'ERR_INVALID_STOCK_VALUE' });
  assert.throws(() => rencanakanPenyesuaian(batch, { jumlah_sesudah: NaN, user_id: 1 }, K), { kode: 'ERR_INVALID_STOCK_VALUE' });
  // null atau '' tidak boleh terkoersi ke 0 lalu diam-diam mengenolkan stok
  assert.throws(() => rencanakanPenyesuaian(batch, { jumlah_sesudah: null, user_id: 1 }, K), { kode: 'ERR_INVALID_STOCK_VALUE' });
  assert.throws(() => rencanakanPenyesuaian(batch, { jumlah_sesudah: '', user_id: 1 }, K), { kode: 'ERR_INVALID_STOCK_VALUE' });

  const okAlasanKosong = rencanakanPenyesuaian(batch, { jumlah_sesudah: 15, alasan: '', user_id: 1 }, K);
  assert.equal(okAlasanKosong.log.alasan, null);
});

// ---------------- domain/inventori.js & domain/pengingat.js ----------------

test('input kosong/null: dataset kosong [] pada inventori, pengingat, notifikasi, dan dashboard', () => {
  const pengaturan = K.pengaturanAwal;
  assert.deepEqual(inventori.saringBatch([], {}), []);
  assert.deepEqual(inventori.agregasi([]), { total_batch: 0, total_unit: 0, total_nilai: 0, _sen: 0 });

  const tabel = inventori.tabelInventori([], {});
  assert.deepEqual(tabel.data, []);
  assert.equal(tabel.meta.total_data, 0);
  assert.equal(tabel.meta.total_halaman, 0);
  assert.equal(tabel.agregasi.total_nilai, 0);

  const p = pengingat.susunPengingat([], pengaturan, K);
  assert.equal(p.total_pengingat, 0);
  assert.deepEqual(p.daftar_item, []);
  assert.deepEqual(pengingat.notifikasiHeader(p), []);
  assert.deepEqual(pengingat.saringTipe(p, undefined, null).daftar_item, []);

  const dash = inventori.ringkasanDashboard([], p, pengaturan, K);
  assert.equal(dash.total_nilai_persediaan, 0);
  assert.equal(dash.total_batch_aktif, 0);
  assert.equal(dash.persentase_nilai_berisiko, 0); // tidak boleh NaN (0/0)
  assert.deepEqual(dash.distributor_berisiko_terbanyak, []);
  assert.deepEqual(dash.tindakan_segera, []);

  assert.equal(pengingat.tglIndo(null), '-');
  assert.equal(pengingat.tglIndo(''), '-');
  assert.equal(pengingat.tglIndo(undefined), '-');
});

test('input kosong/null: perkayaBatch dengan field opsional null & saringBatch exp_end pada ED null', () => {
  const pengaturan = K.pengaturanAwal;
  const b = inventori.perkayaBatch(
    {
      id: 1,
      obat_id: 1,
      distributor_id: 1,
      nomor_batch: null,
      tanggal_masuk: null,
      tanggal_kedaluwarsa: null,
      batas_retur: null,
      jumlah_awal: 10,
      jumlah_saat_ini: 10,
      harga_beli_satuan: null,
      skor_risiko: null,
      status_risiko: null,
      stok_minimum: null,
      aturan_retur_bulan: null,
    },
    pengaturan,
    K
  );

  assert.equal(b.obat.stok_minimum, pengaturan.stok_minimum_default);
  assert.equal(b.harga_beli_satuan, 0);
  assert.equal(b.nilai_total, 0);
  assert.equal(b.skor_risiko, null);
  assert.equal(b.status_risiko, 'belum_tersedia');
  assert.equal(b.sisa_hari_exp, null);
  assert.equal(b.sudah_kedaluwarsa, false);
  assert.equal(inventori.saringBatch([b], { search: '' }).length, 1);
  assert.equal(inventori.saringBatch([b], { search: null }).length, 1);

  // Batch dengan tanggal_kedaluwarsa null tidak boleh lolos filter exp_end
  assert.equal(inventori.saringBatch([b], { exp_end: '2026-12-31' }).length, 0);
});

// ---------------- services/ & index.js ----------------

test('input kosong/null: buatBisnis tanpa repo/prediksi melempar Error', () => {
  assert.throws(() => buatBisnis(), /repo wajib diisi/);
  assert.throws(() => buatBisnis({ repo: buatRepoMemori() }), /prediksi wajib diisi/);
});

test('input kosong/null: pengaturan.ambil pada tabel kosong atau nilai null/string kosong memakai default', async () => {
  const { bisnis: bisnisKosong } = siapkan({ data: { pengaturan: {} } });
  const pKosong = await bisnisKosong.pengaturan.ambil();
  assert.deepEqual(pKosong, K.pengaturanAwal);

  const { bisnis: bisnisNull } = siapkan({
    data: {
      pengaturan: {
        tanggal_acuan: null,
        stok_minimum_default: null,
        batas_kedaluwarsa_warning_hari: '',
        batas_retur_warning_hari: undefined,
      },
    },
  });
  const pNull = await bisnisNull.pengaturan.ambil();
  assert.equal(pNull.tanggal_acuan, K.pengaturanAwal.tanggal_acuan);
  assert.equal(pNull.stok_minimum_default, K.pengaturanAwal.stok_minimum_default);
  assert.equal(pNull.batas_kedaluwarsa_warning_hari, K.pengaturanAwal.batas_kedaluwarsa_warning_hari);
  assert.equal(pNull.batas_retur_warning_hari, K.pengaturanAwal.batas_retur_warning_hari);
});

test('input kosong/null: pengaturan.ubahAturanRetur menolak bulan_sebelum_kedaluwarsa null atau string kosong', async () => {
  const { bisnis, repo } = siapkan();
  await assert.rejects(
    bisnis.pengaturan.ubahAturanRetur(1, { bulan_sebelum_kedaluwarsa: null }),
    { status: 400 }
  );
  await assert.rejects(
    bisnis.pengaturan.ubahAturanRetur(1, { bulan_sebelum_kedaluwarsa: '' }),
    { status: 400 }
  );
  // Pastikan aturan distributor 1 tidak diam-diam berubah jadi 0
  assert.equal((await repo.ambilAturanRetur(1)).bulan_sebelum_kedaluwarsa, 6);
});

test('input kosong/null: batchMasuk.siapkan menolak items kosong/null, tanggal_masuk null, dan field item null/kosong', async () => {
  const { bisnis } = siapkan();

  await assert.rejects(bisnis.batchMasuk.siapkan({ distributor_id: 1, tanggal_masuk: '2026-10-31', items: [] }), { status: 400 });
  await assert.rejects(bisnis.batchMasuk.siapkan({ distributor_id: 1, tanggal_masuk: '2026-10-31', items: null }), { status: 400 });
  await assert.rejects(
    bisnis.batchMasuk.siapkan({
      distributor_id: 1,
      tanggal_masuk: null,
      items: [{ nomor_batch: 'B1', tanggal_kedaluwarsa: '2027-06-01', jumlah: 5, harga_beli_satuan: 1000 }],
    }),
    { status: 400 }
  );

  // Item dengan harga_beli_satuan null atau '' harus ditolak validasi, bukan dianggap harga 0
  await assert.rejects(
    bisnis.batchMasuk.siapkan({
      distributor_id: 1,
      tanggal_masuk: '2026-10-31',
      items: [{ nomor_batch: 'B-HARGA-NULL', tanggal_kedaluwarsa: '2027-06-01', jumlah: 5, harga_beli_satuan: null }],
    }),
    (e) => e.status === 400 && e.detail.some((d) => d.field === 'items[0].harga_beli_satuan')
  );

  // distributor_id null harus ditolak validasi
  await assert.rejects(
    bisnis.batchMasuk.siapkan({
      distributor_id: null,
      tanggal_masuk: '2026-10-31',
      items: [{ nomor_batch: 'B-DIST-NULL', tanggal_kedaluwarsa: '2027-06-01', jumlah: 5, harga_beli_satuan: 1000 }],
    }),
    { status: 400 }
  );

  assert.deepEqual(await bisnis.batchMasuk.setelahTersimpan([]), []);
});

test('input kosong/null: layanan laporan & risiko.hitungUlang pada repo kosong', async () => {
  const { bisnis } = siapkan({ data: {} });
  const p = await bisnis.laporan.daftarPengingat();
  assert.equal(p.total_pengingat, 0);
  assert.deepEqual(await bisnis.laporan.notifikasi(), []);
  const t = await bisnis.laporan.tabelInventori();
  assert.deepEqual(t.data, []);
  assert.equal(t.agregasi.total_nilai, 0);
  const d = await bisnis.laporan.ringkasanDashboard();
  assert.equal(d.total_nilai_persediaan, 0);
  assert.equal(d.persentase_nilai_berisiko, 0);
  const r = await bisnis.risiko.hitungUlang();
  assert.deepEqual(r, { diproses: 0, sukses: 0, fallback: 0 });
});

// ---------------- http/router.js ----------------

test('input kosong/null: endpoint HTTP menolak body kosong/null dan aman pada database kosong', async () => {
  const { app } = buatAppKosong();

  await request(app).put('/api/v1/pengaturan').set('X-Peran', 'admin').send({}).expect(400);
  await request(app).put('/api/v1/pengaturan').set('X-Peran', 'admin').send({ tanggal_acuan: null }).expect(400);
  await request(app).put('/api/v1/pengaturan/aturan-retur/1').set('X-Peran', 'admin').send({ bulan_sebelum_kedaluwarsa: null }).expect(400);
  await request(app).post('/api/v1/penyesuaian-stok').set('X-Peran', 'karyawan').send({ batch_id: 1, jumlah_sesudah: null }).expect(400);
  await request(app).post('/api/v1/penyesuaian-stok').set('X-Peran', 'karyawan').send({}).expect(400);

  const b = await request(app).get('/api/v1/batches').set('X-Peran', 'karyawan').expect(200);
  assert.deepEqual(b.body.data, []);
  assert.equal(b.body.meta.total_data, 0);

  const p = await request(app).get('/api/v1/pengingat').set('X-Peran', 'karyawan').expect(200);
  assert.equal(p.body.data.total_pengingat, 0);

  const d = await request(app).get('/api/v1/dashboard/ringkasan').set('X-Peran', 'admin').expect(200);
  assert.equal(d.body.data.total_nilai_persediaan, 0);
  assert.equal(d.body.data.persentase_nilai_berisiko, 0);
});
