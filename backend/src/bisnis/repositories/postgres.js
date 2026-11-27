'use strict';

/**
 * Implementasi repository dengan raw SQL `pg`, mengikuti skema
 * docs/02-Desain-Database.md v1.0 (Charlene & Kendrick).
 *
 * BELUM DIUJI ke database sungguhan. Kalau nama tabel/kolom di migration final
 * berbeda, cukup ubah SQL di file ini.
 *
 * Pemakaian:  const { Pool } = require('pg');
 *             const repo = buatRepoPostgres(new Pool({ connectionString: process.env.DATABASE_URL }));
 */

const KOLOM_BATCH_BOLEH_DIUBAH = new Set([
  'jumlah_saat_ini', 'nilai_total', 'batas_retur', 'status_retur',
  'skor_risiko', 'status_risiko', 'keterangan',
]);

const SELECT_BATCH = `
  SELECT b.*,
         o.kode_obat, o.nama_obat, o.kategori, o.satuan, o.stok_minimum,
         d.kode AS kode_distributor, d.nama AS nama_distributor, d.telepon AS telepon_distributor,
         a.bulan_sebelum_kedaluwarsa AS aturan_retur_bulan
    FROM batch b
    JOIN obat o ON o.id = b.obat_id
    JOIN distributor d ON d.id = b.distributor_id
    LEFT JOIN aturan_retur a ON a.distributor_id = b.distributor_id`;

const p = (n) => '$' + n; // placeholder parameter pg

function buatRepo(exec, pool) {
  const q = async (text, params) => (await exec(text, params)).rows;

  const repo = {
    async ambilPengaturan() {
      const rows = await q('SELECT kunci, nilai FROM pengaturan');
      return Object.fromEntries(rows.map((r) => [r.kunci, r.nilai]));
    },
    async simpanPengaturan(obj) {
      for (const [k, v] of Object.entries(obj)) {
        await q(
          `INSERT INTO pengaturan (kunci, nilai) VALUES ($1, $2)
           ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai, updated_at = NOW()`,
          [k, String(v)]
        );
      }
    },
    async ambilDistributor(id) {
      const rows = await q('SELECT * FROM distributor WHERE id = $1', [id]);
      return rows[0] || null;
    },
    async daftarAturanRetur() {
      return q(
        `SELECT d.id AS distributor_id, d.kode AS kode_distributor, d.nama AS nama_distributor,
                a.bulan_sebelum_kedaluwarsa, a.keterangan
           FROM distributor d LEFT JOIN aturan_retur a ON a.distributor_id = d.id
          ORDER BY d.kode`
      );
    },
    async ambilAturanRetur(distributorId) {
      const rows = await q('SELECT * FROM aturan_retur WHERE distributor_id = $1', [distributorId]);
      return rows[0] || null;
    },
    async simpanAturanRetur(distributorId, { bulan_sebelum_kedaluwarsa, keterangan }) {
      const rows = await q(
        `INSERT INTO aturan_retur (distributor_id, bulan_sebelum_kedaluwarsa, keterangan)
         VALUES ($1, $2, $3)
         ON CONFLICT (distributor_id) DO UPDATE
           SET bulan_sebelum_kedaluwarsa = EXCLUDED.bulan_sebelum_kedaluwarsa,
               keterangan = EXCLUDED.keterangan, updated_at = NOW()
         RETURNING *`,
        [distributorId, bulan_sebelum_kedaluwarsa, keterangan ?? null]
      );
      return rows[0];
    },
    async ambilBatch(id, { kunci } = {}) {
      // FOR UPDATE OF b: kunci baris batch saja selama transaksi penyesuaian.
      const rows = await q(`${SELECT_BATCH} WHERE b.id = $1 ${kunci ? 'FOR UPDATE OF b' : ''}`, [id]);
      return rows[0] || null;
    },
    async daftarBatch({ distributor_id, ids, hanya_aktif } = {}) {
      const where = [];
      const params = [];
      if (distributor_id !== undefined) {
        params.push(distributor_id);
        where.push(`b.distributor_id = ${p(params.length)}`);
      }
      if (ids) {
        params.push(ids);
        where.push(`b.id = ANY(${p(params.length)}::int[])`);
      }
      if (hanya_aktif) where.push(`b.jumlah_saat_ini > 0 AND b.status_retur NOT IN ('sudah_diretur','dibuang')`);
      return q(`${SELECT_BATCH} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY b.id`, params);
    },
    async perbaruiBatch(id, field) {
      const entri = Object.entries(field).filter(([k]) => KOLOM_BATCH_BOLEH_DIUBAH.has(k));
      if (!entri.length) return;
      const set = entri.map(([k], i) => `${k} = ${p(i + 2)}`).join(', ');
      await q(`UPDATE batch SET ${set}, updated_at = NOW() WHERE id = $1`, [id, ...entri.map(([, v]) => v)]);
    },
    async catatPenyesuaian(log) {
      const rows = await q(
        `INSERT INTO penyesuaian_stok (batch_id, jumlah_sebelum, jumlah_sesudah, selisih, alasan, user_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [log.batch_id, log.jumlah_sebelum, log.jumlah_sesudah, log.selisih, log.alasan, log.user_id]
      );
      return rows[0];
    },
    async daftarPenyesuaian(batchId) {
      return q(
        `SELECT pz.id, pz.created_at AS tanggal, pz.jumlah_sebelum, pz.jumlah_sesudah, pz.selisih, pz.alasan,
                u.nama AS petugas
           FROM penyesuaian_stok pz LEFT JOIN pengguna u ON u.id = pz.user_id
          WHERE pz.batch_id = $1 ORDER BY pz.created_at DESC, pz.id DESC`,
        [batchId]
      );
    },
    async catatInferensi(rec) {
      await q(
        `INSERT INTO riwayat_inferensi (batch_id, skor_risiko, status, input_features, response_raw)
         VALUES ($1, $2, $3, $4, $5)`,
        [rec.batch_id, rec.skor_risiko, rec.status, JSON.stringify(rec.input_features ?? null), JSON.stringify(rec.response_raw ?? null)]
      );
    },
    async transaksi(fn) {
      if (!pool) return fn(repo); // sudah berada di dalam transaksi
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const hasil = await fn(buatRepo((t, prm) => client.query(t, prm), null));
        await client.query('COMMIT');
        return hasil;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
  };
  return repo;
}

function buatRepoPostgres(pool) {
  return buatRepo((t, prm) => pool.query(t, prm), pool);
}

module.exports = { buatRepoPostgres };
