'use strict';

/**
 * Server SEMENTARA untuk mencoba endpoint logika bisnis tanpa database dan
 * tanpa login (data di memori, prediksi pakai stub). Bukan server produksi;
 * server utama + JWT + koneksi Neon tetap dibuat Charlene.
 *
 *   cd backend && npm install && npm run dev:bisnis
 *   Header X-Peran: admin | karyawan  -> pengganti login sementara.
 */
const express = require('express');
const { buatBisnis, buatRepoMemori, buatKlienDariEnv } = require('./index');
const { buatRouterBisnis } = require('./http/router');
const { dataAwal } = require('../../test-support/fixture');

const bisnis = buatBisnis({ repo: buatRepoMemori(dataAwal()), prediksi: buatKlienDariEnv(process.env) });

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const peran = req.get('X-Peran');
  if (peran === 'admin' || peran === 'karyawan') req.user = { id: peran === 'admin' ? 1 : 2, role: peran };
  next();
});
app.use('/api/v1', buatRouterBisnis({ bisnis }));

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`[dev:bisnis] http://localhost:${port}/api/v1  (data memori, prediksi ${process.env.PREDIKSI_MODE || 'stub'})`));
