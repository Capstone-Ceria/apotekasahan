'use strict';

/**
 * Repository di memori. Dipakai untuk tes dan untuk menjalankan modul bisnis
 * tanpa database. Bentuk datanya meniru tabel di docs/02-Desain-Database.md.
 */
function salin(x) {
  return JSON.parse(JSON.stringify(x));
}

function buatRepoMemori(awal = {}) {
  let db = {
    pengaturan: {},
    pengguna: [],
    distributor: [],
    aturan_retur: [],
    obat: [],
    batch: [],
    penyesuaian_stok: [],
    riwayat_inferensi: [],
    ...salin(awal),
  };
  const seq = { penyesuaian_stok: db.penyesuaian_stok.length, riwayat_inferensi: db.riwayat_inferensi.length };
  const sekarang = () => new Date().toISOString();

  function gabungBatch(b) {
    const o = db.obat.find((x) => x.id === b.obat_id) || {};
    const d = db.distributor.find((x) => x.id === b.distributor_id) || {};
    const a = db.aturan_retur.find((x) => x.distributor_id === b.distributor_id);
    return {
      ...salin(b),
      kode_obat: o.kode_obat,
      nama_obat: o.nama_obat,
      kategori: o.kategori,
      satuan: o.satuan,
      stok_minimum: o.stok_minimum,
      kode_distributor: d.kode,
      nama_distributor: d.nama,
      telepon_distributor: d.telepon,
      aturan_retur_bulan: a ? a.bulan_sebelum_kedaluwarsa : null,
    };
  }

  const repo = {
    _db: () => db,
    async ambilPengaturan() {
      return { ...db.pengaturan };
    },
    async simpanPengaturan(obj) {
      for (const [k, v] of Object.entries(obj)) db.pengaturan[k] = String(v);
    },
    async ambilDistributor(id) {
      const d = db.distributor.find((x) => x.id === Number(id));
      return d ? salin(d) : null;
    },
    async daftarAturanRetur() {
      return db.distributor.map((d) => {
        const a = db.aturan_retur.find((x) => x.distributor_id === d.id);
        return {
          distributor_id: d.id,
          kode_distributor: d.kode,
          nama_distributor: d.nama,
          bulan_sebelum_kedaluwarsa: a ? a.bulan_sebelum_kedaluwarsa : null,
          keterangan: a ? a.keterangan ?? null : null,
        };
      });
    },
    async ambilAturanRetur(distributorId) {
      const a = db.aturan_retur.find((x) => x.distributor_id === Number(distributorId));
      return a ? salin(a) : null;
    },
    async simpanAturanRetur(distributorId, { bulan_sebelum_kedaluwarsa, keterangan }) {
      const id = Number(distributorId);
      let a = db.aturan_retur.find((x) => x.distributor_id === id);
      if (!a) {
        a = { id: db.aturan_retur.length + 1, distributor_id: id, created_at: sekarang() };
        db.aturan_retur.push(a);
      }
      a.bulan_sebelum_kedaluwarsa = bulan_sebelum_kedaluwarsa;
      a.keterangan = keterangan ?? null;
      a.updated_at = sekarang();
      return salin(a);
    },
    async ambilBatch(id) {
      const b = db.batch.find((x) => x.id === Number(id));
      return b ? gabungBatch(b) : null;
    },
    async daftarBatch({ distributor_id, ids, hanya_aktif } = {}) {
      let list = db.batch;
      if (distributor_id !== undefined) list = list.filter((b) => b.distributor_id === Number(distributor_id));
      if (ids) list = list.filter((b) => ids.map(Number).includes(b.id));
      if (hanya_aktif) list = list.filter((b) => b.jumlah_saat_ini > 0 && !['sudah_diretur', 'dibuang'].includes(b.status_retur));
      return list.map(gabungBatch);
    },
    async perbaruiBatch(id, field) {
      const b = db.batch.find((x) => x.id === Number(id));
      if (!b) throw new Error(`Batch ${id} tidak ada`);
      Object.assign(b, salin(field), { updated_at: sekarang() });
    },
    async catatPenyesuaian(log) {
      const baris = { id: ++seq.penyesuaian_stok, ...salin(log), created_at: sekarang() };
      db.penyesuaian_stok.push(baris);
      return salin(baris);
    },
    async daftarPenyesuaian(batchId) {
      return db.penyesuaian_stok
        .filter((p) => p.batch_id === Number(batchId))
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1) || b.id - a.id)
        .map((p) => ({
          id: p.id,
          tanggal: p.created_at,
          jumlah_sebelum: p.jumlah_sebelum,
          jumlah_sesudah: p.jumlah_sesudah,
          selisih: p.selisih,
          alasan: p.alasan,
          petugas: (db.pengguna.find((u) => u.id === p.user_id) || {}).nama || null,
        }));
    },
    async catatInferensi(rec) {
      db.riwayat_inferensi.push({ id: ++seq.riwayat_inferensi, ...salin(rec), created_at: sekarang() });
    },
    async transaksi(fn) {
      const cadangan = salin(db);
      const cadSeq = { ...seq };
      try {
        return await fn(repo);
      } catch (e) {
        db = cadangan;
        Object.assign(seq, cadSeq);
        throw e;
      }
    },
  };
  return repo;
}

module.exports = { buatRepoMemori };
