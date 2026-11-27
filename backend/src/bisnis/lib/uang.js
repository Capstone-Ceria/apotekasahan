'use strict';

/**
 * Hitungan rupiah dalam satuan sen (integer) supaya angka tabel dan dashboard
 * sama persis sampai desimal terakhir (TC-DSH-001). Kolom DECIMAL(15,2) dari
 * driver pg datang sebagai string, jadi parsing string dilakukan manual.
 */
function keSen(nilai) {
  if (nilai === null || nilai === undefined || nilai === '') return 0;
  if (typeof nilai === 'number') return Math.round(nilai * 100);
  const s = String(nilai).trim();
  const m = /^(-)?(\d+)(?:\.(\d{0,}))?$/.exec(s);
  if (!m) {
    const n = Number(s);
    if (Number.isNaN(n)) throw new Error(`Nilai uang tidak valid: ${s}`);
    return Math.round(n * 100);
  }
  const desimal = (m[3] || '').padEnd(3, '0');
  let sen = Number(m[2]) * 100 + Number(desimal.slice(0, 2));
  if (Number(desimal[2]) >= 5) sen += 1;
  return m[1] ? -sen : sen;
}

function dariSen(sen) {
  return Math.round(sen) / 100;
}

/** nilai_total = jumlah_saat_ini x harga_beli_satuan, dalam sen. */
function nilaiBatchSen(jumlah, hargaSatuan) {
  return Math.round(Number(jumlah || 0) * keSen(hargaSatuan));
}

module.exports = { keSen, dariSen, nilaiBatchSen };
