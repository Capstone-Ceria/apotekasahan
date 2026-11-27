'use strict';

// Uji bentuk SQL saja (pool palsu). Uji ke Neon sungguhan menunggu migration Charlene.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buatRepoPostgres } = require('../../src/bisnis/repositories/postgres');

function poolPalsu() {
  const log = [];
  const client = { query: async (t, p) => (log.push({ t: t.trim(), p, via: 'client' }), { rows: [] }), release: () => log.push({ t: 'RELEASE' }) };
  return { log, query: async (t, p) => (log.push({ t: t.trim(), p, via: 'pool' }), { rows: [] }), connect: async () => client };
}

test('daftarBatch menyusun WHERE + parameter berurutan', async () => {
  const pool = poolPalsu();
  await buatRepoPostgres(pool).daftarBatch({ distributor_id: 3, ids: [1, 2], hanya_aktif: true });
  const { t, p } = pool.log[0];
  assert.match(t, /WHERE b\.distributor_id = \$1 AND b\.id = ANY\(\$2::int\[\]\) AND b\.jumlah_saat_ini > 0/);
  assert.deepEqual(p, [3, [1, 2]]);
});

test('perbaruiBatch hanya mengizinkan kolom yang dikenal', async () => {
  const pool = poolPalsu();
  await buatRepoPostgres(pool).perbaruiBatch(7, { jumlah_saat_ini: 5, 'id; DROP TABLE batch': 1, nilai_total: 10 });
  const { t, p } = pool.log[0];
  assert.equal(t, 'UPDATE batch SET jumlah_saat_ini = $2, nilai_total = $3, updated_at = NOW() WHERE id = $1');
  assert.deepEqual(p, [7, 5, 10]);
});

test('transaksi: BEGIN/COMMIT di client yang sama, ROLLBACK saat gagal', async () => {
  const pool = poolPalsu();
  const repo = buatRepoPostgres(pool);
  await repo.transaksi(async (tx) => tx.ambilBatch(1, { kunci: true }));
  assert.deepEqual(pool.log.map((l) => l.t.split(/\s+/)[0]), ['BEGIN', 'SELECT', 'COMMIT', 'RELEASE']);
  assert.match(pool.log[1].t, /FOR UPDATE OF b$/);
  assert.equal(pool.log[1].via, 'client');

  pool.log.length = 0;
  await assert.rejects(repo.transaksi(async () => { throw new Error('x'); }));
  assert.deepEqual(pool.log.map((l) => l.t), ['BEGIN', 'ROLLBACK', 'RELEASE']);
});
