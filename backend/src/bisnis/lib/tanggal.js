'use strict';

/**
 * Utilitas tanggal "date-only" (YYYY-MM-DD) dihitung di UTC
 * supaya tidak geser sehari karena zona waktu server (Render = UTC, laptop = WIB).
 */
const POLA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_SEHARI = 24 * 60 * 60 * 1000;

function keTanggal(nilai) {
  if (nilai === null || nilai === undefined || nilai === '') return null;
  if (nilai instanceof Date) {
    if (Number.isNaN(nilai.getTime())) return null;
    // Date dari driver pg untuk kolom DATE dibuat di zona lokal; ambil komponen lokalnya.
    return Date.UTC(nilai.getFullYear(), nilai.getMonth(), nilai.getDate());
  }
  const s = String(nilai).slice(0, 10);
  const m = POLA.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const cek = new Date(t);
  if (cek.getUTCFullYear() !== y || cek.getUTCMonth() !== mo - 1 || cek.getUTCDate() !== d) return null;
  return t;
}

function format(t) {
  if (t === null) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/** Normalisasi ke string 'YYYY-MM-DD' atau null kalau tidak valid. */
function normalisasi(nilai) {
  return format(keTanggal(nilai));
}

function valid(nilai) {
  return keTanggal(nilai) !== null;
}

/**
 * Tambah/kurangi bulan. Kalau tanggal tujuan tidak ada, pakai hari terakhir bulan itu.
 * contoh: tambahBulan('2027-03-31', -1) => '2027-02-28'
 */
function tambahBulan(nilai, bulan) {
  const t = keTanggal(nilai);
  if (t === null) return null;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + bulan;
  const hari = d.getUTCDate();
  const hariTerakhir = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return format(Date.UTC(y, m, Math.min(hari, hariTerakhir)));
}

/** Selisih hari (target - acuan). Positif = target di masa depan. */
function selisihHari(target, acuan) {
  const a = keTanggal(target);
  const b = keTanggal(acuan);
  if (a === null || b === null) return null;
  return Math.round((a - b) / MS_SEHARI);
}

function bandingkan(a, b) {
  return keTanggal(a) - keTanggal(b);
}

module.exports = { normalisasi, valid, tambahBulan, selisihHari, bandingkan };
