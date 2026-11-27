'use strict';

const express = require('express');
const { GalatBisnis } = require('../lib/galat');
const tgl = require('../lib/tanggal');
const { buatSkema } = require('./skema');

/**
 * Router Express untuk endpoint milik logika bisnis. Router ini TIDAK membuat
 * app, tidak mengurus login/JWT, dan tidak membuka koneksi DB: Charlene cukup
 * me-mount-nya di app utama.
 *
 *   app.use('/api/v1', buatRouterBisnis({ bisnis, auth: { wajibLogin, wajibAdmin } }));
 *
 * `auth.wajibLogin` / `auth.wajibAdmin` = middleware milik Charlene [A-24].
 * Default di bawah hanya mengecek `req.user` (diasumsikan diisi middleware JWT Charlene).
 */
const authDefault = {
  wajibLogin(req, res, next) {
    if (!req.user) return res.status(401).json({ sukses: false, pesan: 'Sesi tidak valid, silakan login ulang', error_kode: 'AUTH_REQUIRED' });
    return next();
  },
  wajibAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ sukses: false, pesan: 'Sesi tidak valid, silakan login ulang', error_kode: 'AUTH_REQUIRED' });
    if (req.user.role !== 'admin') return res.status(403).json({ sukses: false, pesan: 'Hanya admin yang boleh mengakses fitur ini', error_kode: 'AUTH_FORBIDDEN' });
    return next();
  },
};

const ok = (res, pesan, data, extra = {}, status = 200) => res.status(status).json({ sukses: true, pesan, data, ...extra });

function validasi(skema, nilai) {
  const { error, value } = skema.validate(nilai, { abortEarly: false, convert: true, stripUnknown: false });
  if (error) {
    throw new GalatBisnis(
      400,
      'ERR_VALIDASI',
      'Validasi input gagal',
      error.details.map((d) => ({ field: d.path.join('.'), pesan: d.message.replace(/"/g, '') }))
    );
  }
  return value;
}

function buatRouterBisnis({ bisnis, auth = {} } = {}) {
  if (!bisnis) throw new Error('bisnis wajib diisi');
  const { wajibLogin, wajibAdmin } = { ...authDefault, ...auth };
  const skema = buatSkema(bisnis.konfigurasi);
  const r = express.Router();
  const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

  // ---- Pengaturan (admin) ----
  r.get('/pengaturan', wajibAdmin, h(async (req, res) => ok(res, 'Pengaturan sistem berhasil dimuat', await bisnis.pengaturan.ambil())));

  r.put('/pengaturan', wajibAdmin, h(async (req, res) => {
    const body = validasi(skema.ubahPengaturan, req.body || {});
    if (body.tanggal_acuan && !tgl.valid(body.tanggal_acuan)) {
      throw new GalatBisnis(400, 'ERR_VALIDASI', 'Validasi input gagal', [{ field: 'tanggal_acuan', pesan: 'Tanggal tidak valid' }]);
    }
    const hasil = await bisnis.pengaturan.ubah(body);
    return ok(res, 'Pengaturan sistem berhasil diperbarui', hasil.pengaturan, {
      meta: { batch_status_retur_berubah: hasil.batch_status_retur_berubah, hitung_ulang_skor: hasil.hitung_ulang_skor },
    });
  }));

  r.get('/pengaturan/aturan-retur', wajibAdmin, h(async (req, res) =>
    ok(res, 'Aturan retur per distributor berhasil dimuat', await bisnis.pengaturan.daftarAturanRetur())));

  r.put('/pengaturan/aturan-retur/:distributor_id', wajibAdmin, h(async (req, res) => {
    const { distributor_id } = validasi(skema.paramDistributor, req.params);
    const body = validasi(skema.ubahAturanRetur, req.body || {});
    const hasil = await bisnis.pengaturan.ubahAturanRetur(distributor_id, body);
    return ok(res, `Aturan retur berhasil diperbarui. ${hasil.total_batch_terdampak} batch terkait telah dihitung ulang batas returnya.`, hasil);
  }));

  // ---- Pengingat ----
  r.get('/pengingat', wajibLogin, h(async (req, res) => {
    const q = validasi(skema.queryPengingat, req.query);
    return ok(res, 'Daftar pengingat aktif berhasil diambil', await bisnis.laporan.daftarPengingat(q));
  }));

  r.get('/pengingat/notifikasi', wajibLogin, h(async (req, res) =>
    ok(res, 'Notifikasi berhasil diambil', await bisnis.laporan.notifikasi())));

  // ---- Penyesuaian stok ----
  r.post('/penyesuaian-stok', wajibLogin, h(async (req, res) => {
    const body = validasi(skema.penyesuaian, req.body || {});
    return ok(res, 'Stok berhasil disesuaikan', await bisnis.penyesuaian.sesuaikan(body, req.user));
  }));

  r.get('/batches/:id/penyesuaian', wajibLogin, h(async (req, res) => {
    const { id } = validasi(skema.paramId, req.params);
    return ok(res, 'Riwayat penyesuaian berhasil dimuat', await bisnis.penyesuaian.riwayat(id));
  }));

  // ---- Inventori / batch ----
  r.get('/batches', wajibLogin, h(async (req, res) => {
    const q = validasi(skema.queryBatch, req.query);
    const { data, meta, agregasi, tanggal_acuan } = await bisnis.laporan.tabelInventori(q);
    return ok(res, 'Daftar batch berhasil diambil', data, { meta: { ...meta, tanggal_acuan, agregasi } });
  }));

  r.get('/batches/:id', wajibLogin, h(async (req, res) => {
    const { id } = validasi(skema.paramId, req.params);
    return ok(res, 'Detail batch berhasil dimuat', await bisnis.laporan.detailBatch(id));
  }));

  // ---- Dashboard ----
  r.get('/dashboard/ringkasan', wajibAdmin, h(async (req, res) =>
    ok(res, 'Ringkasan dashboard berhasil dimuat', await bisnis.laporan.ringkasanDashboard())));

  // ---- Usulan tambahan: hitung ulang skor yang "belum tersedia" ----
  r.post('/risiko/hitung-ulang', wajibAdmin, h(async (req, res) => {
    const body = validasi(skema.hitungUlangSkor, req.body || {});
    const hasil = await bisnis.risiko.hitungUlang({ ids: body.batch_ids, hanyaBelumTersedia: body.hanya_belum_tersedia });
    return ok(res, `${hasil.sukses} skor berhasil dihitung, ${hasil.fallback} masih belum tersedia`, hasil);
  }));

  // Error handler khusus router ini, format docs/03 §1.2 C
  // eslint-disable-next-line no-unused-vars
  r.use((err, req, res, next) => {
    if (err instanceof GalatBisnis) {
      return res.status(err.status).json({ sukses: false, pesan: err.message, error_kode: err.kode, ...(err.detail ? { detail: err.detail } : {}) });
    }
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ sukses: false, pesan: 'Body JSON tidak valid', error_kode: 'ERR_VALIDASI' });
    }
    (req.app.get('logger') || console).error(err);
    return res.status(500).json({ sukses: false, pesan: 'Terjadi gangguan pada server', error_kode: 'ERR_SERVER' });
  });

  return r;
}

module.exports = { buatRouterBisnis, authDefault };
