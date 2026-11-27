'use strict';

const tgl = require('../lib/tanggal');
const uang = require('../lib/uang');
const retur = require('./retur');
const risiko = require('./risiko');

/**
 * SATU-SATUNYA tempat sebuah baris batch diubah jadi "batch siap tampil".
 * Tabel inventori, pengingat, dan dashboard semua lewat fungsi ini,
 * supaya angkanya pasti konsisten (mitigasi risiko di project plan, TC-DSH-001).
 */
function perkayaBatch(row, pengaturan, konfigurasi) {
  const acuan = pengaturan.tanggal_acuan;
  const status_retur = retur.tentukanStatusRetur(row, acuan);
  const status_risiko = row.status_risiko || risiko.STATUS_RISIKO.BELUM;
  const nilaiSen = uang.nilaiBatchSen(row.jumlah_saat_ini, row.harga_beli_satuan);
  const sisaHariExp = tgl.selisihHari(row.tanggal_kedaluwarsa, acuan);
  const stokMinimum = row.stok_minimum ?? pengaturan.stok_minimum_default;
  return {
    id: row.id,
    nomor_batch: row.nomor_batch,
    obat: {
      id: row.obat_id,
      kode_obat: row.kode_obat ?? null,
      nama_obat: row.nama_obat ?? null,
      kategori: row.kategori ?? null,
      satuan: row.satuan ?? null,
      stok_minimum: Number(stokMinimum),
    },
    distributor: {
      id: row.distributor_id,
      kode: row.kode_distributor ?? null,
      nama: row.nama_distributor ?? null,
      telepon: row.telepon_distributor ?? null,
      aturan_retur_bulan: retur.bulanAturan(row.aturan_retur_bulan, konfigurasi),
    },
    tanggal_masuk: tgl.normalisasi(row.tanggal_masuk),
    tanggal_kedaluwarsa: tgl.normalisasi(row.tanggal_kedaluwarsa),
    batas_retur: tgl.normalisasi(row.batas_retur),
    jumlah_awal: Number(row.jumlah_awal),
    jumlah_saat_ini: Number(row.jumlah_saat_ini),
    harga_beli_satuan: uang.dariSen(uang.keSen(row.harga_beli_satuan)),
    nilai_total: uang.dariSen(nilaiSen),
    skor_risiko: row.skor_risiko === null || row.skor_risiko === undefined ? null : Number(row.skor_risiko),
    status_risiko,
    status_risiko_tampil: risiko.statusRisikoTampil(status_risiko, status_retur),
    status_retur,
    sisa_hari_retur: row.batas_retur ? tgl.selisihHari(row.batas_retur, acuan) : null,
    sisa_hari_exp: sisaHariExp,
    sudah_kedaluwarsa: sisaHariExp !== null && sisaHariExp <= 0, // [A-19] ED hari ini dianggap sudah kedaluwarsa
    aktif: retur.batchAktif({ ...row, status_retur }),
    keterangan: row.keterangan ?? null,
    _nilaiSen: nilaiSen,
  };
}

function berisiko(b, konfigurasi) {
  if (!b.aktif) return false;
  if (b.status_risiko === risiko.STATUS_RISIKO.TINGGI) return true;
  return konfigurasi.dashboard.berisikoJikaLewatBatas && b.status_retur === retur.STATUS_RETUR.LEWAT;
}

const KOLOM_URUT = new Set(['tanggal_kedaluwarsa', 'batas_retur', 'skor_risiko', 'jumlah_saat_ini', 'nilai_total', 'nomor_batch']);

/**
 * Filter sesuai query GET /batches (docs/03 §4.1).
 * status_risiko difilter memakai label TAMPIL, supaya filter "tinggi" tidak
 * memunculkan batch lewat batas (sama dengan frontend).
 */
function saringBatch(batches, f = {}) {
  let hasil = batches;
  if (f.hanya_aktif !== false) hasil = hasil.filter((b) => b.aktif);
  if (f.search) {
    const q = String(f.search).toLowerCase();
    hasil = hasil.filter(
      (b) =>
        (b.nomor_batch || '').toLowerCase().includes(q) ||
        (b.obat.nama_obat || '').toLowerCase().includes(q) ||
        (b.obat.kode_obat || '').toLowerCase().includes(q)
    );
  }
  if (f.distributor_id) hasil = hasil.filter((b) => Number(b.distributor.id) === Number(f.distributor_id));
  if (f.obat_id) hasil = hasil.filter((b) => Number(b.obat.id) === Number(f.obat_id));
  if (f.kategori) hasil = hasil.filter((b) => b.obat.kategori === f.kategori);
  if (f.status_risiko) hasil = hasil.filter((b) => b.status_risiko_tampil === f.status_risiko);
  if (f.status_retur) hasil = hasil.filter((b) => b.status_retur === f.status_retur);
  if (f.exp_start) hasil = hasil.filter((b) => tgl.bandingkan(b.tanggal_kedaluwarsa, f.exp_start) >= 0);
  if (f.exp_end) hasil = hasil.filter((b) => tgl.bandingkan(b.tanggal_kedaluwarsa, f.exp_end) <= 0);

  const kolom = KOLOM_URUT.has(f.sort_by) ? f.sort_by : 'tanggal_kedaluwarsa'; // default FEFO
  const arah = f.order === 'desc' ? -1 : 1;
  return [...hasil].sort((a, b) => {
    const va = a[kolom];
    const vb = b[kolom];
    if (va === vb) return a.id - b.id;
    if (va === null || va === undefined) return 1; // null selalu di akhir
    if (vb === null || vb === undefined) return -1;
    return (va < vb ? -1 : 1) * arah;
  });
}

function agregasi(batches) {
  let sen = 0;
  let unit = 0;
  for (const b of batches) {
    sen += b._nilaiSen;
    unit += b.jumlah_saat_ini;
  }
  return { total_batch: batches.length, total_unit: unit, total_nilai: uang.dariSen(sen), _sen: sen };
}

function halaman(list, page = 1, limit = 20) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.max(1, Number(limit) || 20);
  return {
    data: list.slice((p - 1) * l, p * l),
    meta: { halaman: p, limit: l, total_data: list.length, total_halaman: Math.ceil(list.length / l) },
  };
}

/** Buang field internal sebelum dikirim ke klien. */
function bersihkan(b) {
  const { _nilaiSen, ...publik } = b;
  return publik;
}

/**
 * Tabel inventori: daftar terfilter + paginasi + agregasi dari SELURUH hasil filter
 * (bukan hanya halaman aktif).
 */
function tabelInventori(batches, filter = {}) {
  const tersaring = saringBatch(batches, filter);
  const { data, meta } = halaman(tersaring, filter.page, filter.limit);
  const { _sen, ...agg } = agregasi(tersaring);
  return { data: data.map(bersihkan), meta, agregasi: agg };
}

/**
 * Ringkasan dashboard (docs/03 §7.1). Memakai perkayaBatch + agregasi yang sama
 * dengan tabel inventori, jadi total_nilai_persediaan == agregasi.total_nilai tabel tanpa filter.
 */
function ringkasanDashboard(batches, pengingat, pengaturan, konfigurasi) {
  const aktif = batches.filter((b) => b.aktif);
  const total = agregasi(aktif);
  const bahaya = aktif.filter((b) => berisiko(b, konfigurasi));
  const totalBahaya = agregasi(bahaya);

  const perDistributor = new Map();
  for (const b of bahaya) {
    const k = b.distributor.id;
    if (!perDistributor.has(k)) {
      perDistributor.set(k, {
        distributor_id: k,
        nama_distributor: b.distributor.nama,
        aturan_retur_bulan: b.distributor.aturan_retur_bulan,
        jumlah_batch_berisiko: 0,
        _sen: 0,
      });
    }
    const d = perDistributor.get(k);
    d.jumlah_batch_berisiko += 1;
    d._sen += b._nilaiSen;
  }
  const distributor = [...perDistributor.values()]
    .sort((a, b) => b._sen - a._sen || b.jumlah_batch_berisiko - a.jumlah_batch_berisiko)
    .slice(0, konfigurasi.dashboard.topDistributor)
    .map(({ _sen, ...d }) => ({ ...d, nilai_berisiko: uang.dariSen(_sen) }));

  const tindakan = pengingat.daftar.mendesak_retur.slice(0, konfigurasi.dashboard.maksTindakanSegera).map((i) => ({
    batch_id: i.batch_id,
    nama_obat: i.nama_obat,
    nomor_batch: i.nomor_batch,
    distributor: i.distributor,
    nilai_stok: i.nilai_stok,
    hari_tersisa_retur: i.sisa_hari_retur,
    status: i.status_retur,
  }));

  return {
    tanggal_acuan: pengaturan.tanggal_acuan,
    total_nilai_persediaan: total.total_nilai,
    total_batch_aktif: total.total_batch,
    jumlah_batch_berisiko_tinggi: totalBahaya.total_batch,
    total_nilai_berisiko_hangus: totalBahaya.total_nilai,
    persentase_nilai_berisiko: total._sen > 0 ? Number(((totalBahaya._sen / total._sen) * 100).toFixed(2)) : 0,
    distributor_berisiko_terbanyak: distributor,
    tindakan_segera: tindakan,
    ringkasan_pengingat: pengingat.ringkasan,
  };
}

module.exports = { perkayaBatch, berisiko, saringBatch, agregasi, tabelInventori, ringkasanDashboard, bersihkan };
