'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { siapkan } = require('../../test-support/fixture');
const { buatRouterBisnis } = require('../../src/bisnis/http/router');

/** App uji: "middleware JWT" palsu mengisi req.user dari header X-Peran. */
function buatApp(opsi) {
  const { bisnis, repo } = siapkan(opsi);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const peran = req.get('X-Peran');
    if (peran) req.user = { id: peran === 'admin' ? 1 : 2, role: peran };
    next();
  });
  app.use('/api/v1', buatRouterBisnis({ bisnis }));
  return { app, repo };
}

test('auth: tanpa login 401, karyawan ke pengaturan 403 (TC-AUTH-004)', async () => {
  const { app } = buatApp();
  await request(app).get('/api/v1/pengingat').expect(401);
  const r = await request(app).get('/api/v1/pengaturan').set('X-Peran', 'karyawan').expect(403);
  assert.equal(r.body.sukses, false);
  await request(app).get('/api/v1/dashboard/ringkasan').set('X-Peran', 'karyawan').expect(403);
});

test('GET /pengaturan dan PUT validasi', async () => {
  const { app } = buatApp();
  const g = await request(app).get('/api/v1/pengaturan').set('X-Peran', 'admin').expect(200);
  assert.deepEqual(g.body.data, { tanggal_acuan: '2026-10-31', stok_minimum_default: 10, batas_kedaluwarsa_warning_hari: 90, batas_retur_warning_hari: 30 });

  const bad = await request(app).put('/api/v1/pengaturan').set('X-Peran', 'admin').send({ stok_minimum_default: -1, tanggal_acuan: '31-10-2026' }).expect(400);
  assert.equal(bad.body.error_kode, 'ERR_VALIDASI');
  assert.deepEqual(bad.body.detail.map((d) => d.field).sort(), ['stok_minimum_default', 'tanggal_acuan']);

  await request(app).put('/api/v1/pengaturan').set('X-Peran', 'admin').send({ tanggal_acuan: '2026-02-30' }).expect(400);

  const ok = await request(app).put('/api/v1/pengaturan').set('X-Peran', 'admin').send({ stok_minimum_default: 12 }).expect(200);
  assert.equal(ok.body.data.stok_minimum_default, 12);
});

test('PUT aturan retur: pilihan tidak valid 400, valid 200 dengan jumlah batch terdampak', async () => {
  const { app } = buatApp();
  await request(app).put('/api/v1/pengaturan/aturan-retur/1').set('X-Peran', 'admin').send({ bulan_sebelum_kedaluwarsa: 2 }).expect(400);
  const r = await request(app).put('/api/v1/pengaturan/aturan-retur/1').set('X-Peran', 'admin').send({ bulan_sebelum_kedaluwarsa: 3 }).expect(200);
  assert.equal(r.body.data.total_batch_terdampak, 2);
  assert.match(r.body.pesan, /2 batch terkait/);
  await request(app).put('/api/v1/pengaturan/aturan-retur/99').set('X-Peran', 'admin').send({ bulan_sebelum_kedaluwarsa: 3 }).expect(404);
});

test('POST /penyesuaian-stok: -5 => 422 ERR_INVALID_STOCK_VALUE, valid => 200', async () => {
  const { app } = buatApp();
  const bad = await request(app).post('/api/v1/penyesuaian-stok').set('X-Peran', 'karyawan').send({ batch_id: 1, jumlah_sesudah: -5 }).expect(422);
  assert.equal(bad.body.error_kode, 'ERR_INVALID_STOCK_VALUE');
  assert.equal(bad.body.pesan, 'Jumlah stok fisik sesudah penyesuaian tidak boleh kurang dari 0');
  await request(app).post('/api/v1/penyesuaian-stok').set('X-Peran', 'karyawan').send({ batch_id: 1 }).expect(400);
  const ok = await request(app).post('/api/v1/penyesuaian-stok').set('X-Peran', 'karyawan').send({ batch_id: 1, jumlah_sesudah: 15, alasan: 'Kemasan Bocor' }).expect(200);
  assert.equal(ok.body.data.selisih, -5);
});

test('GET /pengingat dan /pengingat/notifikasi', async () => {
  const { app } = buatApp();
  const r = await request(app).get('/api/v1/pengingat?tipe=semua').set('X-Peran', 'karyawan').expect(200);
  assert.equal(r.body.data.tanggal_acuan_sistem, '2026-10-31');
  assert.ok(Array.isArray(r.body.data.daftar_item));
  await request(app).get('/api/v1/pengingat?tipe=ngawur').set('X-Peran', 'karyawan').expect(400);
  const n = await request(app).get('/api/v1/pengingat/notifikasi').set('X-Peran', 'karyawan').expect(200);
  assert.ok(n.body.data.length > 0);
});

test('GET /batches dengan filter, paginasi, dan agregasi; /batches/:id', async () => {
  const { app } = buatApp();
  const r = await request(app).get('/api/v1/batches?limit=2&page=1').set('X-Peran', 'karyawan').expect(200);
  assert.equal(r.body.data.length, 2);
  assert.equal(r.body.meta.total_data, 5);
  assert.equal(r.body.meta.total_halaman, 3);
  assert.equal(r.body.meta.agregasi.total_nilai, 257507);
  assert.equal(r.body.data[0]._nilaiSen, undefined);
  await request(app).get('/api/v1/batches?status_risiko=parah').set('X-Peran', 'karyawan').expect(400);
  const d = await request(app).get('/api/v1/batches/1').set('X-Peran', 'karyawan').expect(200);
  assert.equal(d.body.data.nomor_batch, 'A-MENDESAK');
  await request(app).get('/api/v1/batches/999').set('X-Peran', 'karyawan').expect(404);
});

test('GET /dashboard/ringkasan konsisten dengan /batches', async () => {
  const { app } = buatApp();
  const dash = await request(app).get('/api/v1/dashboard/ringkasan').set('X-Peran', 'admin').expect(200);
  const tabel = await request(app).get('/api/v1/batches').set('X-Peran', 'admin').expect(200);
  assert.equal(dash.body.data.total_nilai_persediaan, tabel.body.meta.agregasi.total_nilai);
});

test('POST /risiko/hitung-ulang (admin)', async () => {
  const { app } = buatApp();
  const r = await request(app).post('/api/v1/risiko/hitung-ulang').set('X-Peran', 'admin').send({}).expect(200);
  assert.equal(r.body.data.diproses, 3);
});
