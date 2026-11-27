'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const tgl = require('../../src/bisnis/lib/tanggal');
const retur = require('../../src/bisnis/domain/retur');
const inventori = require('../../src/bisnis/domain/inventori');
const pengingat = require('../../src/bisnis/domain/pengingat');
const { buatKonfigurasi } = require('../../src/bisnis/config/default');
const { buatBisnis, buatRepoMemori, buatKlienStub } = require('../../src/bisnis');

const JUMLAH_BATCH = 1400;
const BATAS_MS = 500;
const TANGGAL_ACUAN = '2026-10-31';
const K = buatKonfigurasi();
const loggerSenyap = { warn() {}, error() {}, info() {}, log() {} };

function tambahHari(iso, hari) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + hari)).toISOString().slice(0, 10);
}

/**
 * Generator deterministik 1.400 batch dummy dengan distribusi realistis:
 * 10 distributor (aturan 6, 3, 1, 0, dan default), 100 obat,
 * mencakup mendesak retur, lewat batas (belum & sudah ED), ED hari ini,
 * konsinyasi dekat ED, stok menipis, batch nonaktif, dan batch aman.
 */
function buatDatasetDummy(jumlah = JUMLAH_BATCH) {
  const aturanDist = [6, 3, 1, 0, 6, 3, 6, 1, 0, null]; // dist 10 memakai default (6 bln)
  const kategoriList = ['Antibiotik', 'Analgesik', 'Vitamin', 'Antihipertensi', 'Antidiabetes'];
  const satuanList = ['strip', 'botol', 'box', 'tube'];

  const distributor = aturanDist.map((_, idx) => ({
    id: idx + 1,
    kode: `DST-${String(idx + 1).padStart(3, '0')}`,
    nama: `PBF Dummy ${idx + 1}`,
    telepon: `08120000${String(idx + 1).padStart(2, '0')}`,
  }));

  const aturan_retur = [];
  aturanDist.forEach((bln, idx) => {
    if (bln !== null) {
      aturan_retur.push({ id: idx + 1, distributor_id: idx + 1, bulan_sebelum_kedaluwarsa: bln });
    }
  });

  const obat = Array.from({ length: 100 }, (_, idx) => ({
    id: idx + 1,
    kode_obat: `OBT-${String(idx + 1).padStart(3, '0')}`,
    nama_obat: `Obat Uji ${idx + 1} ${kategoriList[idx % kategoriList.length]}`,
    kategori: kategoriList[idx % kategoriList.length],
    satuan: satuanList[idx % satuanList.length],
    stok_minimum: 5 + (idx % 5) * 5, // 5..25
  }));

  const batch = [];
  const rowsGabungan = [];

  for (let i = 1; i <= jumlah; i += 1) {
    const obatIdx = (i - 1) % obat.length;
    const distIdx = (i - 1) % distributor.length;
    const o = obat[obatIdx];
    const d = distributor[distIdx];
    const blnAturan = aturanDist[distIdx];
    const blnEfektif = blnAturan === null ? K.retur.bulanDefault : blnAturan;

    const bucket = i % 20;
    let ed;
    let statusReturAwal = 'bisa_diretur';
    let jumlahAwal = 40 + (i % 60);
    let jumlahKini = 15 + (i % 45);
    let skor = Number((((i * 37) % 100) / 100).toFixed(4));
    let statusRisiko = skor >= 0.75 ? 'tinggi' : skor >= 0.5 ? 'sedang' : 'rendah';

    if (bucket === 0 || bucket === 1) {
      // Nonaktif: sudah diretur / dibuang / stok 0
      ed = tambahHari(TANGGAL_ACUAN, 60 + (i % 90));
      statusReturAwal = bucket === 0 ? 'sudah_diretur' : 'dibuang';
      jumlahKini = 0;
    } else if (bucket >= 2 && bucket <= 5) {
      // Mendesak retur (batas retur 0..29 hari lagi -> ED ~ blnEfektif bulan + 0..29 hari)
      const targetBatas = tambahHari(TANGGAL_ACUAN, i % 30);
      ed = tgl.tambahBulan(targetBatas, blnEfektif || 1);
    } else if (bucket >= 6 && bucket <= 8) {
      // Lewat batas retur (sebagian ED hari ini, sebagian sudah ED, sebagian belum ED)
      if (i % 60 === 6) ed = TANGGAL_ACUAN; // ED hari ini
      else if (bucket === 6) ed = tambahHari(TANGGAL_ACUAN, -(1 + (i % 15))); // sudah ED
      else ed = tambahHari(TANGGAL_ACUAN, 15 + (i % 45)); // belum ED tapi lewat batas retur
    } else if (bucket >= 9 && bucket <= 11) {
      // Mendekati kedaluwarsa (1..89 hari)
      ed = tambahHari(TANGGAL_ACUAN, 1 + (i % 89));
    } else if (bucket >= 12 && bucket <= 14) {
      // Stok menipis (1..stok_minimum)
      ed = tambahHari(TANGGAL_ACUAN, 240 + (i % 180));
      jumlahKini = 1 + (i % o.stok_minimum);
    } else {
      // Batch aman
      ed = tambahHari(TANGGAL_ACUAN, 300 + (i % 360));
      if (bucket === 19) {
        skor = null;
        statusRisiko = null;
      }
    }

    const batasRetur = retur.hitungBatasRetur(ed, blnEfektif);
    if (!retur.STATUS_TERMINAL.has(statusReturAwal)) {
      statusReturAwal = retur.tentukanStatusRetur({ batas_retur: batasRetur }, TANGGAL_ACUAN);
    }
    const hargaStr = `${1500 + (i % 95) * 500}.${String((i * 17) % 100).padStart(2, '0')}`;

    const itemBatch = {
      id: i,
      obat_id: o.id,
      distributor_id: d.id,
      nomor_batch: `B-${String(i).padStart(4, '0')}`,
      tanggal_masuk: '2026-01-15',
      tanggal_kedaluwarsa: ed,
      batas_retur: batasRetur,
      jumlah_awal: jumlahAwal,
      jumlah_saat_ini: jumlahKini,
      harga_beli_satuan: hargaStr,
      status_retur: statusReturAwal,
      skor_risiko: skor,
      status_risiko: statusRisiko,
    };
    batch.push(itemBatch);
    rowsGabungan.push({
      ...itemBatch,
      kode_obat: o.kode_obat,
      nama_obat: o.nama_obat,
      kategori: o.kategori,
      satuan: o.satuan,
      stok_minimum: o.stok_minimum,
      kode_distributor: d.kode,
      nama_distributor: d.nama,
      telepon_distributor: d.telepon,
      aturan_retur_bulan: blnAturan,
    });
  }

  return {
    dataRepo: {
      pengaturan: {
        tanggal_acuan: TANGGAL_ACUAN,
        stok_minimum_default: '10',
        batas_kedaluwarsa_warning_hari: '90',
        batas_retur_warning_hari: '30',
      },
      pengguna: [{ id: 1, nama: 'Admin Uji', role: 'admin' }],
      distributor,
      aturan_retur,
      obat,
      batch,
    },
    rowsGabungan,
  };
}

function ukurSync(nama, fn) {
  const mulai = performance.now();
  const hasil = fn();
  const durasiMs = Number((performance.now() - mulai).toFixed(2));
  return { nama, durasiMs, hasil };
}

async function ukurAsync(nama, fn) {
  const mulai = performance.now();
  const hasil = await fn();
  const durasiMs = Number((performance.now() - mulai).toFixed(2));
  return { nama, durasiMs, hasil };
}

test(`performa domain (1.400 batch dummy): tiap fungsi < ${BATAS_MS} ms`, (t) => {
  const { rowsGabungan } = buatDatasetDummy(JUMLAH_BATCH);
  const pengaturan = { ...K.pengaturanAwal, tanggal_acuan: TANGGAL_ACUAN };
  const catatan = [];

  const rPerkaya = ukurSync('domain.inventori.perkayaBatch (1.400x)', () =>
    rowsGabungan.map((r) => inventori.perkayaBatch(r, pengaturan, K))
  );
  catatan.push(rPerkaya);
  assert.equal(rPerkaya.hasil.length, JUMLAH_BATCH);

  const batches = rPerkaya.hasil;

  const rSaring = ukurSync('domain.inventori.saringBatch (filter+search+sort)', () =>
    inventori.saringBatch(batches, {
      search: 'Obat Uji',
      kategori: 'Antibiotik',
      exp_start: '2026-10-01',
      exp_end: '2028-12-31',
      sort_by: 'tanggal_kedaluwarsa',
      order: 'asc',
    })
  );
  catatan.push(rSaring);
  assert.ok(rSaring.hasil.length > 0);

  const rTabel = ukurSync('domain.inventori.tabelInventori (paginasi+agregasi)', () =>
    inventori.tabelInventori(batches, { page: 1, limit: 20 })
  );
  catatan.push(rTabel);
  assert.equal(rTabel.hasil.data.length, 20);

  const rPengingatBatch = ukurSync('domain.pengingat.susunPengingat (per_batch)', () =>
    pengingat.susunPengingat(batches, pengaturan, K)
  );
  catatan.push(rPengingatBatch);
  assert.ok(rPengingatBatch.hasil.ringkasan.mendesak_retur > 0);
  assert.ok(rPengingatBatch.hasil.ringkasan.lewat_batas_retur > 0);
  assert.ok(rPengingatBatch.hasil.ringkasan.mendekati_kedaluwarsa > 0);
  assert.ok(rPengingatBatch.hasil.ringkasan.stok_menipis > 0);

  const KPerObat = buatKonfigurasi({ pengingat: { modeStokMenipis: 'per_obat' } });
  const rPengingatObat = ukurSync('domain.pengingat.susunPengingat (per_obat)', () =>
    pengingat.susunPengingat(batches, pengaturan, KPerObat)
  );
  catatan.push(rPengingatObat);

  const rNotif = ukurSync('domain.pengingat.notifikasiHeader', () =>
    pengingat.notifikasiHeader(rPengingatBatch.hasil)
  );
  catatan.push(rNotif);
  assert.equal(new Set(rNotif.hasil.map((n) => n.batch_id)).size, rNotif.hasil.length);

  const rDash = ukurSync('domain.inventori.ringkasanDashboard', () =>
    inventori.ringkasanDashboard(batches, rPengingatBatch.hasil, pengaturan, K)
  );
  catatan.push(rDash);

  // Konsistensi TC-DSH-001 pada skala 1.400 batch
  assert.equal(rDash.hasil.total_nilai_persediaan, rTabel.hasil.agregasi.total_nilai);
  assert.equal(rDash.hasil.total_batch_aktif, rTabel.hasil.meta.total_data);

  for (const c of catatan) {
    t.diagnostic(`[PERFORMA DOMAIN] ${c.nama}: ${c.durasiMs} ms (batas < ${BATAS_MS} ms)`);
    assert.ok(c.durasiMs < BATAS_MS, `${c.nama} memakan waktu ${c.durasiMs} ms (melebihi batas ${BATAS_MS} ms)`);
  }
});

test(`performa layanan/services (1.400 batch dummy via repo memori): tiap fungsi < ${BATAS_MS} ms`, async (t) => {
  const { dataRepo } = buatDatasetDummy(JUMLAH_BATCH);
  const repo = buatRepoMemori(dataRepo);
  const tugasLatar = [];
  const bisnis = buatBisnis({
    repo,
    prediksi: buatKlienStub(),
    logger: loggerSenyap,
    jalankanLatar: (fn) => tugasLatar.push(fn),
  });
  const catatan = [];

  const rTabel = await ukurAsync('services.laporan.tabelInventori', () =>
    bisnis.laporan.tabelInventori({ page: 1, limit: 20, sort_by: 'tanggal_kedaluwarsa' })
  );
  catatan.push(rTabel);

  const rPengingat = await ukurAsync('services.laporan.daftarPengingat', () =>
    bisnis.laporan.daftarPengingat({ tipe: 'semua' })
  );
  catatan.push(rPengingat);

  const rNotif = await ukurAsync('services.laporan.notifikasi', () =>
    bisnis.laporan.notifikasi()
  );
  catatan.push(rNotif);

  const rDash = await ukurAsync('services.laporan.ringkasanDashboard', () =>
    bisnis.laporan.ringkasanDashboard()
  );
  catatan.push(rDash);

  // Verifikasi konsistensi nilai dashboard == tabel inventori pada 1.400 batch
  assert.equal(rDash.hasil.total_nilai_persediaan, rTabel.hasil.agregasi.total_nilai);
  assert.equal(rDash.hasil.total_batch_aktif, rTabel.hasil.meta.total_data);

  const rUbahAturan = await ukurAsync('services.pengaturan.ubahAturanRetur (dist 1)', () =>
    bisnis.pengaturan.ubahAturanRetur(1, { bulan_sebelum_kedaluwarsa: 3, keterangan: 'Uji performa' })
  );
  catatan.push(rUbahAturan);
  assert.ok(rUbahAturan.hasil.total_batch_terdampak > 0);

  const rUbahTanggal = await ukurAsync('services.pengaturan.ubah (tanggal_acuan 1.400 batch)', () =>
    bisnis.pengaturan.ubah({ tanggal_acuan: '2026-12-01' })
  );
  catatan.push(rUbahTanggal);
  assert.equal(rUbahTanggal.hasil.pengaturan.tanggal_acuan, '2026-12-01');

  const rHitungUlang = await ukurAsync('services.risiko.hitungUlang (1.400 batch, stub)', () =>
    bisnis.risiko.hitungUlang({ hanyaBelumTersedia: false })
  );
  catatan.push(rHitungUlang);
  assert.ok(rHitungUlang.hasil.diproses > 1000);
  assert.equal(rHitungUlang.hasil.fallback, 0);

  for (const c of catatan) {
    t.diagnostic(`[PERFORMA SERVICE] ${c.nama}: ${c.durasiMs} ms (batas < ${BATAS_MS} ms)`);
    assert.ok(c.durasiMs < BATAS_MS, `${c.nama} memakan waktu ${c.durasiMs} ms (melebihi batas ${BATAS_MS} ms)`);
  }
});
