'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { siapkan } = require('../../test-support/fixture');
const { buatKlienMati, buatKlienHttp, buatKlienStub } = require('../../src/bisnis');

const idDi = (list) => list.map((i) => i.batch_id).sort((a, b) => a - b);

// ---------------- Pengingat ----------------

test('pengingat: kategori sesuai triage #11 dan batch nonaktif tidak muncul', async () => {
  const { bisnis } = siapkan();
  const p = await bisnis.laporan.daftarPengingat();
  assert.equal(p.tanggal_acuan_sistem, '2026-10-31');
  assert.deepEqual(idDi(p.daftar.mendesak_retur), [1]);
  assert.deepEqual(idDi(p.daftar.lewat_batas_retur), [2]); // TC-REM-002
  assert.deepEqual(idDi(p.daftar.mendekati_kedaluwarsa), [3]);
  assert.deepEqual(idDi(p.daftar.stok_menipis), [4]); // batch 3: 8 > min obat 5
  const semuaId = p.daftar_item.map((i) => i.batch_id);
  assert.ok(!semuaId.includes(5), 'batch sudah diretur tidak boleh muncul');
});

test('TC-REM-003: distributor aturan 0 tidak pernah masuk daftar retur', async () => {
  const { bisnis } = siapkan();
  const p = await bisnis.laporan.daftarPengingat();
  for (const k of ['bisa_diretur', 'mendesak_retur', 'lewat_batas_retur']) {
    assert.ok(!p.daftar[k].some((i) => i.batch_id === 3), `batch konsinyasi muncul di ${k}`);
  }
  assert.ok(p.daftar.mendekati_kedaluwarsa.some((i) => i.batch_id === 3));
});

test('pengingat: daftar datar urut tenggat terdekat, stok menipis di akhir', async () => {
  const { bisnis } = siapkan();
  const p = await bisnis.laporan.daftarPengingat();
  const tenggat = p.daftar_item.map((i) => i.tenggat);
  const berTanggal = tenggat.filter(Boolean);
  assert.deepEqual(berTanggal, [...berTanggal].sort());
  const idxNullPertama = tenggat.indexOf(null);
  assert.ok(tenggat.slice(idxNullPertama).every((t) => t === null));
  const mendesak = p.daftar_item.find((i) => i.kategori_alert === 'mendesak_retur');
  assert.equal(mendesak.hari_menuju_batas_retur, 15);
  assert.match(mendesak.pesan_peringatan, /15 hari lagi \(15 Nov 2026\)/);
});

test('pengingat: filter tipe dan limit', async () => {
  const { bisnis } = siapkan();
  const p = await bisnis.laporan.daftarPengingat({ tipe: 'retur' });
  assert.ok(p.daftar_item.every((i) => i.kategori_alert === 'mendesak_retur'));
  const l = await bisnis.laporan.daftarPengingat({ limit: 1 });
  assert.equal(l.daftar_item.length, 1);
});

test('stok menipis mode per_obat: total semua batch satu obat', async () => {
  const { bisnis } = siapkan({ konfigurasi: { pengingat: { modeStokMenipis: 'per_obat' } } });
  const p = await bisnis.laporan.daftarPengingat();
  // obat 2: batch 3 (8) + batch 4 (3) = 11 > min 5 -> tidak menipis; obat 1: 20+12+50 = 82 > 10
  assert.equal(p.daftar.stok_menipis.length, 0);
});

test('TC-REM-005: ubah tanggal acuan => pengingat dihitung ulang', async () => {
  const { bisnis, repo, jalankanLatar } = siapkan();
  const hasil = await bisnis.pengaturan.ubah({ tanggal_acuan: '2026-12-01' });
  assert.equal(hasil.pengaturan.tanggal_acuan, '2026-12-01');
  assert.equal(hasil.hitung_ulang_skor.dijadwalkan, true);
  const p = await bisnis.laporan.daftarPengingat();
  // batch 1 (batas 2026-11-15) sekarang lewat batas
  assert.ok(p.daftar.lewat_batas_retur.some((i) => i.batch_id === 1));
  // status tersimpan di DB ikut diperbarui
  assert.equal((await repo.ambilBatch(1)).status_retur, 'lewat_batas');
  await jalankanLatar();
  assert.notEqual((await repo.ambilBatch(1)).skor_risiko, null); // skor dihitung ulang (stub)
});

test('notifikasi header: satu per batch, prioritas lewat batas > retur > stok', async () => {
  const { bisnis } = siapkan();
  const n = await bisnis.laporan.notifikasi();
  const ids = n.map((x) => x.id);
  assert.deepEqual(ids, ['exp-ret-2', 'warn-ret-1', 'low-4']);
  assert.equal(new Set(n.map((x) => x.batch_id)).size, n.length);
  assert.equal(n.find((x) => x.id === 'warn-ret-1').title, 'Retur Sisa 15 Hari');
});

// ---------------- Aturan retur ----------------

test('TC-REM-004: ubah aturan retur distributor menghitung ulang batas retur', async () => {
  const { bisnis, repo } = siapkan();
  const h = await bisnis.pengaturan.ubahAturanRetur(1, { bulan_sebelum_kedaluwarsa: 3, keterangan: 'Perjanjian baru' });
  assert.equal(h.total_batch_terdampak, 2); // batch 2 & 4
  assert.equal((await repo.ambilBatch(2)).batas_retur, '2026-11-20');
  assert.equal((await repo.ambilBatch(2)).status_retur, 'bisa_diretur'); // kembali bisa diretur
  assert.equal((await repo.ambilBatch(4)).batas_retur, '2027-09-01');
});

test('aturan retur: nilai di luar pilihan ditolak, distributor tak dikenal 404', async () => {
  const { bisnis } = siapkan();
  await assert.rejects(bisnis.pengaturan.ubahAturanRetur(1, { bulan_sebelum_kedaluwarsa: 2 }), { status: 400 });
  await assert.rejects(bisnis.pengaturan.ubahAturanRetur(99, { bulan_sebelum_kedaluwarsa: 3 }), { status: 404 });
});

test('aturan retur jadi 0 => batch jadi tidak_bisa_diretur', async () => {
  const { bisnis, repo } = siapkan();
  await bisnis.pengaturan.ubahAturanRetur(2, { bulan_sebelum_kedaluwarsa: 0 });
  const b1 = await repo.ambilBatch(1);
  assert.equal(b1.batas_retur, null);
  assert.equal(b1.status_retur, 'tidak_bisa_diretur');
  assert.equal((await repo.ambilBatch(5)).status_retur, 'sudah_diretur'); // terminal tidak disentuh
});

test('daftar aturan retur menandai distributor yang memakai default', async () => {
  const { bisnis } = siapkan();
  const list = await bisnis.pengaturan.daftarAturanRetur();
  const d4 = list.find((d) => d.distributor_id === 4);
  assert.equal(d4.bulan_sebelum_kedaluwarsa, null);
  assert.equal(d4.bulan_efektif, 6);
  assert.equal(d4.memakai_default, true);
});

// ---------------- Penyesuaian stok ----------------

test('TC-STK-001: stok 20 -> 15 tercatat selisih -5 dan nilai_total ikut berubah', async () => {
  const { bisnis, repo } = siapkan();
  const h = await bisnis.penyesuaian.sesuaikan({ batch_id: 1, jumlah_sesudah: 15, alasan: 'Kemasan Bocor' }, { id: 2 });
  assert.equal(h.jumlah_sebelum, 20);
  assert.equal(h.jumlah_sesudah, 15);
  assert.equal(h.selisih, -5);
  assert.equal(typeof h.skor_risiko_baru, 'number');
  const b = await repo.ambilBatch(1);
  assert.equal(b.jumlah_saat_ini, 15);
  assert.equal(b.nilai_total, 22501.5); // 15 x 1500.10
  const riwayat = await bisnis.penyesuaian.riwayat(1);
  assert.equal(riwayat[0].selisih, -5);
  assert.equal(riwayat[0].petugas, 'Karyawan');
});

test('TC-STK-002: stok negatif ditolak 422 dan tidak ada yang tersimpan', async () => {
  const { bisnis, repo } = siapkan();
  await assert.rejects(bisnis.penyesuaian.sesuaikan({ batch_id: 1, jumlah_sesudah: -5 }, { id: 2 }), { status: 422, kode: 'ERR_INVALID_STOCK_VALUE' });
  assert.equal(repo._db().penyesuaian_stok.length, 0);
  assert.equal((await repo.ambilBatch(1)).jumlah_saat_ini, 20);
});

test('penyesuaian: batch tidak ada 404, batch sudah diretur 422', async () => {
  const { bisnis } = siapkan();
  await assert.rejects(bisnis.penyesuaian.sesuaikan({ batch_id: 999, jumlah_sesudah: 1 }, { id: 2 }), { status: 404 });
  await assert.rejects(bisnis.penyesuaian.sesuaikan({ batch_id: 5, jumlah_sesudah: 1 }, { id: 2 }), { kode: 'ERR_BATCH_TIDAK_AKTIF' });
});

test('penyesuaian: transaksi di-rollback kalau update batch gagal', async () => {
  const { bisnis, repo } = siapkan();
  const asli = repo.perbaruiBatch;
  repo.perbaruiBatch = async () => {
    throw new Error('DB putus');
  };
  await assert.rejects(bisnis.penyesuaian.sesuaikan({ batch_id: 1, jumlah_sesudah: 10 }, { id: 2 }));
  repo.perbaruiBatch = asli;
  assert.equal(repo._db().penyesuaian_stok.length, 0);
});

test('penyesuaian ke 0: batch keluar dari pengingat, model tidak dipanggil', async () => {
  let dipanggil = 0;
  const { bisnis } = siapkan({ prediksi: { nama: 'hitung', async prediksi() { dipanggil += 1; return { skor_risiko: 0.5 }; } } });
  await bisnis.penyesuaian.sesuaikan({ batch_id: 1, jumlah_sesudah: 0, alasan: 'Habis' }, { id: 2 });
  assert.equal(dipanggil, 0);
  const p = await bisnis.laporan.daftarPengingat();
  assert.ok(!p.daftar_item.some((i) => i.batch_id === 1));
});

// ---------------- Risiko & fallback ----------------

test('TC-RSK-002: layanan prediksi mati => tetap tersimpan, "Skor belum tersedia", tercatat di riwayat_inferensi', async () => {
  const { bisnis, repo } = siapkan({ prediksi: buatKlienMati() });
  const h = await bisnis.penyesuaian.sesuaikan({ batch_id: 4, jumlah_sesudah: 2 }, { id: 2 });
  assert.equal(h.skor_risiko_baru, null);
  assert.equal(h.status_risiko, 'belum_tersedia');
  const b = await repo.ambilBatch(4);
  assert.equal(b.jumlah_saat_ini, 2);
  assert.equal(b.keterangan, 'Skor belum tersedia');
  assert.equal(repo._db().riwayat_inferensi.at(-1).status, 'gagal');
});

test('fallback mode "pertahankan" menyimpan skor lama', async () => {
  const { bisnis, repo } = siapkan({ prediksi: buatKlienMati(), konfigurasi: { risiko: { saatGagal: 'pertahankan' } } });
  await bisnis.penyesuaian.sesuaikan({ batch_id: 4, jumlah_sesudah: 2 }, { id: 2 });
  assert.equal((await repo.ambilBatch(4)).skor_risiko, 0.2);
});

test('klien HTTP: timeout dicatat sebagai "timeout" dan tidak melempar ke pemanggil', async () => {
  const fetchLambat = (url, { signal }) =>
    new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const prediksi = buatKlienHttp({ baseUrl: 'http://ai.test', timeoutMs: 20, fetchFn: fetchLambat });
  const { bisnis, repo } = siapkan({ prediksi });
  const h = await bisnis.batchMasuk.setelahTersimpan([6]);
  assert.equal(h[0].status_risiko, 'belum_tersedia');
  assert.equal(repo._db().riwayat_inferensi.at(-1).status, 'timeout');
});

test('klien HTTP: kirim fitur + header rahasia, simpan skor & label', async () => {
  let diterima;
  const fetchOk = async (url, opt) => {
    diterima = { url, opt };
    return { ok: true, status: 200, json: async () => ({ sukses: true, skor_risiko: 0.8145, kategori_risiko: 'tinggi' }) };
  };
  const prediksi = buatKlienHttp({ baseUrl: 'http://ai.test/', rahasia: 'r4h4s1a', fetchFn: fetchOk });
  const { bisnis, repo } = siapkan({ prediksi });
  await bisnis.batchMasuk.setelahTersimpan([6]);
  assert.equal(diterima.url, 'http://ai.test/predict-risk');
  assert.equal(diterima.opt.headers['X-Internal-Secret'], 'r4h4s1a');
  assert.equal(JSON.parse(diterima.opt.body).batch_id, 6);
  const b = await repo.ambilBatch(6);
  assert.equal(b.skor_risiko, 0.8145);
  assert.equal(b.status_risiko, 'tinggi');
  assert.equal(repo._db().riwayat_inferensi.at(-1).status, 'sukses');
});

test('klien HTTP: respons 500 => fallback', async () => {
  const prediksi = buatKlienHttp({ baseUrl: 'http://ai.test', fetchFn: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
  const { bisnis } = siapkan({ prediksi });
  const [h] = await bisnis.batchMasuk.setelahTersimpan([6]);
  assert.equal(h.sumber, 'fallback');
});

test('hitung ulang hanya skor yang belum tersedia', async () => {
  const { bisnis, repo } = siapkan({ prediksi: buatKlienStub() });
  const r = await bisnis.risiko.hitungUlang({ hanyaBelumTersedia: true });
  assert.equal(r.diproses, 3); // batch 1, 3, 6 (5 nonaktif, 2 & 4 sudah punya skor)
  assert.equal((await repo.ambilBatch(2)).skor_risiko, 0.9); // tidak disentuh
});

// ---------------- Batch masuk ----------------

test('batch masuk: hitung batas retur, nilai, dan status awal', async () => {
  const { bisnis } = siapkan();
  const s = await bisnis.batchMasuk.siapkan({
    distributor_id: 2,
    tanggal_masuk: '2026-10-18',
    items: [{ obat_id: 1, nomor_batch: 'BMX', tanggal_kedaluwarsa: '2027-06-01', jumlah: 50, harga_beli_satuan: 42000 }],
  });
  const [r] = s.baris;
  assert.equal(r.batas_retur, '2027-03-01');
  assert.equal(r.status_retur, 'bisa_diretur');
  assert.equal(r.nilai_total, 2100000);
  assert.equal(r.status_risiko, 'belum_tersedia');
});

test('TC-INP-007 & validasi lain: tanggal lampau, jumlah 0, batch kosong', async () => {
  const { bisnis } = siapkan();
  await assert.rejects(
    bisnis.batchMasuk.siapkan({
      distributor_id: 1,
      tanggal_masuk: '2026-10-18',
      items: [{ nomor_batch: '', tanggal_kedaluwarsa: '2023-01-01', jumlah: 0, harga_beli_satuan: -1 }],
    }),
    (e) => {
      const f = e.detail.map((d) => d.field);
      assert.ok(f.includes('items[0].nomor_batch'));
      assert.ok(f.includes('items[0].tanggal_kedaluwarsa'));
      assert.ok(f.includes('items[0].jumlah'));
      assert.ok(f.includes('items[0].harga_beli_satuan'));
      return e.status === 400;
    }
  );
});

// ---------------- Inventori & dashboard ----------------

test('TC-DSH-001: total dashboard == total tabel inventori (tanpa filter), sampai sen', async () => {
  const { bisnis } = siapkan();
  const tabel = await bisnis.laporan.tabelInventori({ limit: 1 });
  const dash = await bisnis.laporan.ringkasanDashboard();
  // 20x1500.10 + 12x2000 + 8x18500 + 3x18500 + 50x0.10
  assert.equal(tabel.agregasi.total_nilai, 30002 + 24000 + 148000 + 55500 + 5);
  assert.equal(dash.total_nilai_persediaan, tabel.agregasi.total_nilai);
  assert.equal(dash.total_batch_aktif, tabel.meta.total_data);
  assert.equal(tabel.data.length, 1); // paginasi tidak memengaruhi agregasi
});

test('dashboard: batch berisiko = risiko tinggi atau lewat batas, per distributor', async () => {
  const { bisnis } = siapkan();
  const d = await bisnis.laporan.ringkasanDashboard();
  assert.equal(d.jumlah_batch_berisiko_tinggi, 1); // batch 2
  assert.equal(d.total_nilai_berisiko_hangus, 24000);
  assert.equal(d.distributor_berisiko_terbanyak[0].distributor_id, 1);
  assert.equal(d.tindakan_segera[0].batch_id, 1);
  assert.equal(d.tindakan_segera[0].hari_tersisa_retur, 15);
});

test('TC-DSH-002: filter distributor + risiko; filter "tinggi" tidak memunculkan batch lewat batas', async () => {
  const { bisnis } = siapkan();
  const t = await bisnis.laporan.tabelInventori({ distributor_id: 1, status_risiko: 'tinggi' });
  assert.equal(t.data.length, 0);
  const s = await bisnis.laporan.tabelInventori({ distributor_id: 1, status_risiko: 'sedang' });
  assert.deepEqual(s.data.map((b) => b.id), [2]);
  assert.equal(s.data[0].status_risiko, 'tinggi'); // nilai asli dari model tetap ada
});

test('inventori: filter rentang ED, pencarian, urutan', async () => {
  const { bisnis } = siapkan();
  const t = await bisnis.laporan.tabelInventori({ exp_start: '2026-11-01', exp_end: '2027-02-16' });
  assert.deepEqual(t.data.map((b) => b.id), [3, 1]); // FEFO
  const c = await bisnis.laporan.tabelInventori({ search: 'parac' });
  assert.deepEqual(c.data.map((b) => b.id).sort(), [3, 4]);
  const u = await bisnis.laporan.tabelInventori({ sort_by: 'jumlah_saat_ini', order: 'desc' });
  assert.equal(u.data[0].id, 6);
  const kosong = await bisnis.laporan.tabelInventori({ search: 'xyz123' });
  assert.equal(kosong.meta.total_data, 0);
});

test('detail batch menyertakan riwayat penyesuaian', async () => {
  const { bisnis } = siapkan();
  await bisnis.penyesuaian.sesuaikan({ batch_id: 1, jumlah_sesudah: 18, alasan: 'cek fisik' }, { id: 1 });
  const d = await bisnis.laporan.detailBatch(1);
  assert.equal(d.riwayat_penyesuaian.length, 1);
  assert.equal(d.obat.nama_obat, 'Amoxicillin 500mg');
  await assert.rejects(bisnis.laporan.detailBatch(999), { status: 404 });
});
