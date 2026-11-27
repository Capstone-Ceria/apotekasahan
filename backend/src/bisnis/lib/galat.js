'use strict';

/** Error bisnis yang bisa dipetakan langsung ke format respons kontrak API (§1.2 C). */
class GalatBisnis extends Error {
  constructor(status, kode, pesan, detail) {
    super(pesan);
    this.name = 'GalatBisnis';
    this.status = status;
    this.kode = kode;
    this.detail = detail;
  }
}

const galat = {
  validasi: (pesan, detail) => new GalatBisnis(400, 'ERR_VALIDASI', pesan, detail),
  tidakDitemukan: (pesan) => new GalatBisnis(404, 'ERR_TIDAK_DITEMUKAN', pesan),
  logika: (kode, pesan, detail) => new GalatBisnis(422, kode, pesan, detail),
};

module.exports = { GalatBisnis, galat };
