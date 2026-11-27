'use strict';

/**
 * ADAPTER layanan prediksi risiko.
 *
 * Semua klien punya bentuk yang sama:
 *   async prediksi(fitur) => { skor_risiko, kategori_risiko?, ...respons mentah }
 *   melempar Error (err.jenis = 'timeout' | 'gagal') kalau gagal.
 *
 * Siapa pun yang akhirnya menulis klien HTTP final (Charlene atau Dio, lihat [A-20]),
 * cukup menyediakan objek dengan method `prediksi` ini. Logika di services/ tidak berubah.
 */

class GalatPrediksi extends Error {
  constructor(jenis, pesan, respons) {
    super(pesan);
    this.name = 'GalatPrediksi';
    this.jenis = jenis; // 'timeout' | 'gagal'
    this.respons = respons;
  }
}

/** Klien HTTP ke FastAPI (docs/03 §9.1). Memakai fetch bawaan Node 18+. */
function buatKlienHttp({ baseUrl, rahasia, timeoutMs = 5000, path = '/predict-risk', fetchFn = globalThis.fetch }) {
  if (!baseUrl) throw new Error('PREDIKSI_URL belum diisi');
  const url = baseUrl.replace(/\/$/, '') + path;
  return {
    nama: 'http',
    async prediksi(fitur) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res;
      try {
        res = await fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(rahasia ? { 'X-Internal-Secret': rahasia } : {}) },
          body: JSON.stringify(fitur),
          signal: ctrl.signal,
        });
      } catch (e) {
        if (e && e.name === 'AbortError') throw new GalatPrediksi('timeout', `Layanan prediksi tidak merespons dalam ${timeoutMs} ms`);
        throw new GalatPrediksi('gagal', `Layanan prediksi tidak bisa dihubungi: ${e.message}`);
      } finally {
        clearTimeout(timer);
      }
      let body = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      if (!res.ok || (body && body.sukses === false)) {
        throw new GalatPrediksi('gagal', `Layanan prediksi membalas HTTP ${res.status}`, body);
      }
      return body;
    },
  };
}

/**
 * Stub berbasis aturan sederhana, dipakai sebelum layanan Fachri online.
 * Meniru logika simulasi di frontend/src/services/api.js tapi deterministik.
 * Skor ini BUKAN hasil model; jangan dipakai saat demo ke PIC.
 */
function buatKlienStub() {
  return {
    nama: 'stub',
    async prediksi(f) {
      let skor = 0.25;
      const sisaRetur = f.sisa_hari_ke_batas_retur;
      const sisaExp = f.sisa_hari_ke_kedaluwarsa;
      if (sisaRetur !== null && sisaRetur < 0) skor = 0.72;
      else if (sisaRetur !== null && sisaRetur <= 30) skor = 0.85;
      else if (sisaRetur !== null && sisaRetur <= 60) skor = 0.6;
      else if (sisaRetur === null && sisaExp !== null && sisaExp <= 90) skor = 0.8;
      if (f.rasio_stok_tersisa !== undefined && f.rasio_stok_tersisa < 0.2) skor = Math.max(0, skor - 0.1);
      return { sukses: true, batch_id: f.batch_id, skor_risiko: Number(skor.toFixed(4)), sumber: 'stub' };
    },
  };
}

/** Klien yang selalu gagal, untuk menguji fallback "skor belum tersedia". */
function buatKlienMati(jenis = 'gagal') {
  return {
    nama: 'mati',
    async prediksi() {
      throw new GalatPrediksi(jenis, 'Layanan prediksi dimatikan');
    },
  };
}

/** Pilih klien dari env: PREDIKSI_MODE = http | stub | mati. */
function buatKlienDariEnv(env = process.env, konfigurasi) {
  const mode = (env.PREDIKSI_MODE || (env.PREDIKSI_URL ? 'http' : 'stub')).toLowerCase();
  if (mode === 'http') {
    return buatKlienHttp({
      baseUrl: env.PREDIKSI_URL,
      rahasia: env.PREDIKSI_SECRET,
      timeoutMs: Number(env.PREDIKSI_TIMEOUT_MS) || (konfigurasi && konfigurasi.prediksi.timeoutMs) || 5000,
      path: (konfigurasi && konfigurasi.prediksi.path) || '/predict-risk',
    });
  }
  if (mode === 'mati') return buatKlienMati();
  return buatKlienStub();
}

module.exports = { GalatPrediksi, buatKlienHttp, buatKlienStub, buatKlienMati, buatKlienDariEnv };
