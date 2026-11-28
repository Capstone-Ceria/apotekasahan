'use strict';

const { galat } = require('../lib/galat');
const inventori = require('../domain/inventori');
const pengingat = require('../domain/pengingat');
const tenggat = require('../domain/tenggat');

/**
 * Pengingat, tabel inventori, detail batch, dan dashboard.
 * Semuanya membaca batch lewat `muatBatch()` + `perkayaBatch()` yang sama,
 * jadi tanggal acuan dipakai seragam dan angka antar-menu konsisten.
 *
 * Catatan performa: data ±1.400 batch dimuat penuh lalu dihitung di Node.
 * Untuk skala prototipe ini aman (< 50 ms). Kalau nanti lambat, ganti muatBatch
 * dengan query terfilter tanpa mengubah rumus.
 */
function buatLayananLaporan(ctx) {
  const { repo, konfigurasi } = ctx;

  async function muatBatch() {
    const pengaturan = await ctx.pengaturan.ambil();
    const rows = await repo.daftarBatch({});
    return { pengaturan, batches: rows.map((r) => inventori.perkayaBatch(r, pengaturan, konfigurasi)) };
  }

  async function daftarPengingat({ tipe = 'semua', limit } = {}) {
    const { pengaturan, batches } = await muatBatch();
    const hasil = pengingat.susunPengingat(batches, pengaturan, konfigurasi);
    return pengingat.saringTipe(hasil, tipe, limit);
  }

  async function notifikasi() {
    const { pengaturan, batches } = await muatBatch();
    return pengingat.notifikasiHeader(pengingat.susunPengingat(batches, pengaturan, konfigurasi));
  }

  async function tabelInventori(filter = {}) {
    const { pengaturan, batches } = await muatBatch();
    return { tanggal_acuan: pengaturan.tanggal_acuan, ...inventori.tabelInventori(batches, filter) };
  }

  async function detailBatch(id) {
    const row = await repo.ambilBatch(id);
    if (!row) throw galat.tidakDitemukan('Batch tidak ditemukan');
    const pengaturan = await ctx.pengaturan.ambil();
    const b = inventori.bersihkan(inventori.perkayaBatch(row, pengaturan, konfigurasi));
    return { ...b, riwayat_penyesuaian: await repo.daftarPenyesuaian(id) };
  }

  async function ringkasanDashboard() {
    const { pengaturan, batches } = await muatBatch();
    const hasilPengingat = pengingat.susunPengingat(batches, pengaturan, konfigurasi);
    return inventori.ringkasanDashboard(batches, hasilPengingat, pengaturan, konfigurasi);
  }

  async function daftarTenggat(opsi = {}) {
    const { pengaturan, batches } = await muatBatch();
    return tenggat.daftarTenggatPerTanggal(batches, opsi, pengaturan, konfigurasi);
  }

  return { daftarPengingat, notifikasi, tabelInventori, detailBatch, ringkasanDashboard, daftarTenggat };
}

module.exports = { buatLayananLaporan };
