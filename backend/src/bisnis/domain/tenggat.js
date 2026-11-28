'use strict';

const tgl = require('../lib/tanggal');
const uang = require('../lib/uang');
const { galat } = require('../lib/galat');
const { buatKonfigurasi } = require('../config/default');
const retur = require('./retur');

const POLA_BULAN = /^(\d{4})-(\d{2})$/;

const JENIS_TENGGAT = Object.freeze({
  BATAS_RETUR: 'batas_retur',
  KEDALUWARSA: 'kedaluwarsa',
});

const PILIHAN_JENIS = new Set(['semua', JENIS_TENGGAT.BATAS_RETUR, JENIS_TENGGAT.KEDALUWARSA]);

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseBulan(nilai) {
  if (typeof nilai !== 'string') return null;
  const m = POLA_BULAN.exec(nilai.trim());
  if (!m) return null;
  const tahun = Number(m[1]);
  const bulan = Number(m[2]);
  if (bulan < 1 || bulan > 12) return null;
  return { tahun, bulan, teks: `${m[1]}-${m[2]}` };
}

/**
 * Urai dan validasi rentang bulan berformat 'YYYY-MM' (inklusif).
 * Menerima { bulan_awal, bulan_akhir } atau shorthand { bulan } untuk satu bulan.
 */
function uraiRentangBulan(rentang) {
  if (!rentang || typeof rentang !== 'object') {
    throw galat.validasi('Rentang bulan wajib diisi', [{ field: 'bulan_awal', pesan: 'Format bulan harus YYYY-MM (bulan 01-12)' }]);
  }

  const pakaiShorthand = rentang.bulan !== undefined && rentang.bulan_awal === undefined;
  const rawAwal = rentang.bulan_awal !== undefined ? rentang.bulan_awal : rentang.bulan;
  const rawAkhir =
    rentang.bulan_akhir !== undefined
      ? rentang.bulan_akhir
      : rentang.bulan !== undefined
        ? rentang.bulan
        : rentang.bulan_awal;

  const detail = [];
  const awal = parseBulan(rawAwal);
  if (!awal) {
    detail.push({
      field: pakaiShorthand ? 'bulan' : 'bulan_awal',
      pesan: 'Format bulan harus YYYY-MM (bulan 01-12)',
    });
  }

  const akhir = parseBulan(rawAkhir);
  if (!akhir && (rentang.bulan_akhir !== undefined || awal)) {
    detail.push({
      field: 'bulan_akhir',
      pesan: 'Format bulan harus YYYY-MM (bulan 01-12)',
    });
  }

  if (detail.length) throw galat.validasi('Rentang bulan tidak valid', detail);

  if (awal.teks > akhir.teks) {
    throw galat.validasi('Rentang bulan tidak valid', [
      { field: 'bulan_akhir', pesan: 'bulan_akhir tidak boleh lebih awal dari bulan_awal' },
    ]);
  }

  const hariTerakhir = new Date(Date.UTC(akhir.tahun, akhir.bulan, 0)).getUTCDate();
  return {
    bulan_awal: awal.teks,
    bulan_akhir: akhir.teks,
    tanggal_awal: `${awal.teks}-01`,
    tanggal_akhir: `${akhir.teks}-${pad2(hariTerakhir)}`,
  };
}

function ambilAturanBatch(b) {
  if (b.distributor && typeof b.distributor === 'object' && b.distributor.aturan_retur_bulan !== undefined) {
    return b.distributor.aturan_retur_bulan;
  }
  if (b.aturan_retur_bulan !== undefined) return b.aturan_retur_bulan;
  if (b.bulan_sebelum_kedaluwarsa !== undefined) return b.bulan_sebelum_kedaluwarsa;
  return null;
}

function nilaiStokBatch(b) {
  if (typeof b.nilai_total === 'number' && Number.isFinite(b.nilai_total)) return b.nilai_total;
  return uang.dariSen(uang.nilaiBatchSen(b.jumlah_saat_ini, b.harga_beli_satuan));
}

function buatItemDasar(b, kolomRetur, ed) {
  const obat = b.obat && typeof b.obat === 'object' ? b.obat : null;
  const dist = b.distributor && typeof b.distributor === 'object' ? b.distributor : null;
  return {
    batch_id: b.id ?? b.batch_id ?? null,
    obat_id: obat ? obat.id : (b.obat_id ?? null),
    nama_obat: obat ? obat.nama_obat : (b.nama_obat ?? null),
    nomor_batch: b.nomor_batch ?? null,
    distributor_id: dist ? dist.id : (b.distributor_id ?? null),
    distributor: dist ? dist.nama : (b.nama_distributor ?? null),
    aturan_retur_bulan: kolomRetur.aturan_retur_bulan,
    sisa_stok: Number(b.jumlah_saat_ini ?? 0),
    satuan: obat ? obat.satuan : (b.satuan ?? null),
    nilai_stok: nilaiStokBatch(b),
    tanggal_kedaluwarsa: ed,
    batas_retur: kolomRetur.batas_retur,
    status_retur: kolomRetur.status_retur,
  };
}

function bandingkanItem(a, b) {
  const ida = Number(a.batch_id ?? Number.MAX_SAFE_INTEGER);
  const idb = Number(b.batch_id ?? Number.MAX_SAFE_INTEGER);
  if (ida !== idb) return ida - idb;
  return String(a.nomor_batch || '').localeCompare(String(b.nomor_batch || ''));
}

/**
 * Susun daftar tenggat per tanggal (batas retur dan kedaluwarsa) untuk rentang bulan tertentu [A-25].
 *
 * Memakai ulang domain/retur.js (`hitungKolomRetur` -> `bulanAturan`, `hitungBatasRetur`,
 * `tentukanStatusRetur`, serta `batchAktif`) tanpa menduplikasi rumus batas retur.
 * Menerima baik batch hasil `inventori.perkayaBatch` maupun baris batch mentah dari repository.
 */
function daftarTenggatPerTanggal(batches, rentang, pengaturan = {}, konfigurasi = buatKonfigurasi()) {
  const cfg = konfigurasi || buatKonfigurasi();
  const periode = uraiRentangBulan(rentang);

  const jenis = rentang.jenis === undefined || rentang.jenis === null ? 'semua' : rentang.jenis;
  if (!PILIHAN_JENIS.has(jenis)) {
    throw galat.validasi('Filter jenis tenggat tidak valid', [
      { field: 'jenis', pesan: 'Pilihan yang diizinkan: semua, batas_retur, kedaluwarsa' },
    ]);
  }

  const hanyaAktif = rentang.hanya_aktif !== false;
  const tanggalAcuan = tgl.normalisasi(pengaturan && pengaturan.tanggal_acuan) || cfg.pengaturanAwal.tanggal_acuan;
  const daftar = Array.isArray(batches) ? batches : [];

  const petaTanggal = new Map();
  const ambilBucket = (iso) => {
    if (!petaTanggal.has(iso)) {
      petaTanggal.set(iso, { tanggal: iso, batas_retur: [], kedaluwarsa: [] });
    }
    return petaTanggal.get(iso);
  };

  for (const b of daftar) {
    if (!b || typeof b !== 'object') continue;

    const ed = tgl.normalisasi(b.tanggal_kedaluwarsa);
    const aturan = ambilAturanBatch(b);
    const kolomRetur = retur.hitungKolomRetur({ ...b, tanggal_kedaluwarsa: ed }, aturan, tanggalAcuan, cfg);

    if (hanyaAktif && !retur.batchAktif({ ...b, status_retur: kolomRetur.status_retur })) continue;

    const masukRetur =
      (jenis === 'semua' || jenis === JENIS_TENGGAT.BATAS_RETUR) &&
      kolomRetur.batas_retur !== null &&
      kolomRetur.batas_retur >= periode.tanggal_awal &&
      kolomRetur.batas_retur <= periode.tanggal_akhir;

    const masukEd =
      (jenis === 'semua' || jenis === JENIS_TENGGAT.KEDALUWARSA) &&
      ed !== null &&
      ed >= periode.tanggal_awal &&
      ed <= periode.tanggal_akhir;

    if (!masukRetur && !masukEd) continue;

    const dasar = buatItemDasar(b, kolomRetur, ed);

    if (masukRetur) {
      const sisaHari = tgl.selisihHari(kolomRetur.batas_retur, tanggalAcuan);
      ambilBucket(kolomRetur.batas_retur).batas_retur.push({
        jenis: JENIS_TENGGAT.BATAS_RETUR,
        tanggal: kolomRetur.batas_retur,
        ...dasar,
        sisa_hari: sisaHari,
        sudah_lewat: sisaHari !== null && sisaHari < 0, // [A-05] hari H masih bisa diretur
      });
    }

    if (masukEd) {
      const sisaHari = tgl.selisihHari(ed, tanggalAcuan);
      ambilBucket(ed).kedaluwarsa.push({
        jenis: JENIS_TENGGAT.KEDALUWARSA,
        tanggal: ed,
        ...dasar,
        sisa_hari: sisaHari,
        sudah_lewat: sisaHari !== null && sisaHari <= 0, // [A-19] ED hari ini sudah kedaluwarsa
      });
    }
  }

  let totalBatasRetur = 0;
  let totalKedaluwarsa = 0;

  const perTanggal = [...petaTanggal.values()]
    .sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0))
    .map((g) => {
      g.batas_retur.sort(bandingkanItem);
      g.kedaluwarsa.sort(bandingkanItem);
      totalBatasRetur += g.batas_retur.length;
      totalKedaluwarsa += g.kedaluwarsa.length;
      return {
        tanggal: g.tanggal,
        total: g.batas_retur.length + g.kedaluwarsa.length,
        jumlah_batas_retur: g.batas_retur.length,
        jumlah_kedaluwarsa: g.kedaluwarsa.length,
        batas_retur: g.batas_retur,
        kedaluwarsa: g.kedaluwarsa,
        item: [...g.batas_retur, ...g.kedaluwarsa],
      };
    });

  return {
    tanggal_acuan: tanggalAcuan,
    rentang: periode,
    ringkasan: {
      total_tanggal: perTanggal.length,
      total_tenggat: totalBatasRetur + totalKedaluwarsa,
      total_batas_retur: totalBatasRetur,
      total_kedaluwarsa: totalKedaluwarsa,
    },
    per_tanggal: perTanggal,
  };
}

module.exports = {
  JENIS_TENGGAT,
  uraiRentangBulan,
  daftarTenggatPerTanggal,
};
