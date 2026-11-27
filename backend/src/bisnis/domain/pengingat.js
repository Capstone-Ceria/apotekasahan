'use strict';

const { STATUS_RETUR } = require('./retur');

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function tglIndo(s) {
  if (!s) return '-';
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

const KATEGORI = Object.freeze({
  MENDESAK_RETUR: 'mendesak_retur',
  LEWAT_BATAS: 'lewat_batas_retur',
  DEKAT_ED: 'mendekati_kedaluwarsa',
  STOK_MENIPIS: 'stok_menipis',
});

function itemDasar(b) {
  return {
    batch_id: b.id,
    obat_id: b.obat.id,
    nama_obat: b.obat.nama_obat,
    nomor_batch: b.nomor_batch,
    distributor_id: b.distributor.id,
    distributor: b.distributor.nama,
    telepon_distributor: b.distributor.telepon,
    sisa_stok: b.jumlah_saat_ini,
    satuan: b.obat.satuan,
    stok_minimum: b.obat.stok_minimum,
    nilai_stok: b.nilai_total,
    tanggal_kedaluwarsa: b.tanggal_kedaluwarsa,
    batas_retur: b.batas_retur,
    sisa_hari_retur: b.sisa_hari_retur,
    sisa_hari_exp: b.sisa_hari_exp,
    hari_menuju_batas_retur: b.sisa_hari_retur,
    hari_menuju_kedaluwarsa: b.sisa_hari_exp,
    sudah_kedaluwarsa: b.sudah_kedaluwarsa,
    status_retur: b.status_retur,
    skor_risiko: b.skor_risiko,
    status_risiko: b.status_risiko,
    status_risiko_tampil: b.status_risiko_tampil,
  };
}

function urut(list, kunci) {
  return list.sort((a, b) => {
    const va = a[kunci] ?? Number.MAX_SAFE_INTEGER;
    const vb = b[kunci] ?? Number.MAX_SAFE_INTEGER;
    return va - vb || a.batch_id - b.batch_id;
  });
}

/**
 * Susun daftar pengingat dari batch yang sudah diperkaya (domain/inventori.perkayaBatch).
 * Kategori mengikuti triage #10/#11: bisa_diretur (+ subset mendesak_retur),
 * lewat_batas_retur, mendekati_kedaluwarsa, stok_menipis.
 * Hanya batch aktif (stok > 0, belum diretur/dibuang).
 */
function susunPengingat(batches, pengaturan, konfigurasi) {
  const warnRetur = Number(pengaturan.batas_retur_warning_hari);
  const warnExp = Number(pengaturan.batas_kedaluwarsa_warning_hari);
  const { hariKritisRetur, hariKritisKedaluwarsa, modeStokMenipis } = konfigurasi.pengingat;
  const aktif = batches.filter((b) => b.aktif);

  const bisaDiretur = [];
  const mendesak = [];
  const lewat = [];
  const dekatEd = [];
  const stokTipis = [];

  for (const b of aktif) {
    const dasar = itemDasar(b);

    if (b.status_retur === STATUS_RETUR.BISA) {
      const sisa = b.sisa_hari_retur;
      const urgensi = sisa <= hariKritisRetur ? 'kritis' : sisa <= warnRetur ? 'waspada' : 'normal';
      const item = { ...dasar, urgensi };
      bisaDiretur.push(item);
      if (sisa >= 0 && sisa <= warnRetur) {
        mendesak.push({
          ...item,
          kategori_alert: KATEGORI.MENDESAK_RETUR,
          tenggat: b.batas_retur,
          pesan_peringatan:
            sisa === 0
              ? `Hari ini batas terakhir retur (${tglIndo(b.batas_retur)}). Segera ajukan retur ke distributor!`
              : `Batas retur ${sisa} hari lagi (${tglIndo(b.batas_retur)}). Segera ajukan retur ke distributor!`,
        });
      }
    }

    if (b.status_retur === STATUS_RETUR.LEWAT) {
      lewat.push({
        ...dasar,
        kategori_alert: KATEGORI.LEWAT_BATAS,
        tenggat: b.tanggal_kedaluwarsa,
        urgensi: b.sudah_kedaluwarsa ? 'kritis' : 'waspada',
        // triage #7: belum ED -> Prioritas Jual, sudah ED -> Catat Dibuang
        aksi_disarankan: b.sudah_kedaluwarsa ? 'catat_dibuang' : 'prioritas_jual',
        pesan_peringatan: b.sudah_kedaluwarsa
          ? `Batas retur terlewat (${tglIndo(b.batas_retur)}) dan obat sudah kedaluwarsa. Catat pembuangan.`
          : `Batas retur terlewat (${tglIndo(b.batas_retur)}). Prioritaskan penjualan sebelum ${tglIndo(b.tanggal_kedaluwarsa)}.`,
      });
    }

    if (b.sisa_hari_exp !== null && b.sisa_hari_exp <= warnExp) {
      dekatEd.push({
        ...dasar,
        kategori_alert: KATEGORI.DEKAT_ED,
        tenggat: b.tanggal_kedaluwarsa,
        urgensi: b.sisa_hari_exp <= hariKritisKedaluwarsa ? 'kritis' : 'waspada',
        pesan_peringatan: b.sudah_kedaluwarsa
          ? `Obat sudah kedaluwarsa (${tglIndo(b.tanggal_kedaluwarsa)}).`
          : `Obat kedaluwarsa ${b.sisa_hari_exp} hari lagi (${tglIndo(b.tanggal_kedaluwarsa)}).` +
            (b.status_retur === STATUS_RETUR.LEWAT ? ` Batas retur sudah terlewat (${tglIndo(b.batas_retur)})!` : ''),
      });
    }

    if (modeStokMenipis === 'per_batch' && b.jumlah_saat_ini <= b.obat.stok_minimum) {
      stokTipis.push({
        ...dasar,
        kategori_alert: KATEGORI.STOK_MENIPIS,
        tenggat: null,
        urgensi: 'waspada',
        pesan_peringatan: `Stok tinggal ${b.jumlah_saat_ini} ${b.obat.satuan || 'unit'} (minimum ${b.obat.stok_minimum}).`,
      });
    }
  }

  if (modeStokMenipis === 'per_obat') {
    const perObat = new Map();
    for (const b of aktif) {
      const k = b.obat.id;
      if (!perObat.has(k)) perObat.set(k, []);
      perObat.get(k).push(b);
    }
    for (const list of perObat.values()) {
      const total = list.reduce((s, b) => s + b.jumlah_saat_ini, 0);
      const min = list[0].obat.stok_minimum;
      if (total <= min) {
        const fefo = [...list].sort((a, b) => (a.sisa_hari_exp ?? 0) - (b.sisa_hari_exp ?? 0))[0];
        stokTipis.push({
          ...itemDasar(fefo),
          sisa_stok: total,
          batch_ids: list.map((b) => b.id),
          kategori_alert: KATEGORI.STOK_MENIPIS,
          tenggat: null,
          urgensi: 'waspada',
          pesan_peringatan: `Total stok ${fefo.obat.nama_obat} tinggal ${total} ${fefo.obat.satuan || 'unit'} (minimum ${min}).`,
        });
      }
    }
  }

  urut(bisaDiretur, 'sisa_hari_retur');
  urut(mendesak, 'sisa_hari_retur');
  urut(lewat, 'sisa_hari_exp');
  urut(dekatEd, 'sisa_hari_exp');
  stokTipis.sort((a, b) => a.sisa_stok - b.sisa_stok || a.batch_id - b.batch_id);

  // Daftar datar: urut tenggat terdekat; stok menipis (tanpa tenggat) di akhir.
  const daftarItem = [...mendesak, ...lewat, ...dekatEd, ...stokTipis].sort((a, b) => {
    if (a.tenggat === b.tenggat) return a.batch_id - b.batch_id;
    if (!a.tenggat) return 1;
    if (!b.tenggat) return -1;
    return a.tenggat < b.tenggat ? -1 : 1;
  });

  return {
    tanggal_acuan_sistem: pengaturan.tanggal_acuan,
    total_pengingat: daftarItem.length,
    ringkasan: {
      bisa_diretur: bisaDiretur.length,
      mendesak_retur: mendesak.length,
      lewat_batas_retur: lewat.length,
      mendekati_kedaluwarsa: dekatEd.length,
      stok_menipis: stokTipis.length,
    },
    daftar: {
      bisa_diretur: bisaDiretur,
      mendesak_retur: mendesak,
      lewat_batas_retur: lewat,
      mendekati_kedaluwarsa: dekatEd,
      stok_menipis: stokTipis,
    },
    daftar_item: daftarItem,
  };
}

const TIPE = {
  semua: null,
  retur: [KATEGORI.MENDESAK_RETUR],
  lewat_batas: [KATEGORI.LEWAT_BATAS],
  kedaluwarsa: [KATEGORI.DEKAT_ED],
  stok_menipis: [KATEGORI.STOK_MENIPIS],
};

function saringTipe(hasil, tipe = 'semua', limit) {
  const izin = TIPE[tipe] || null;
  let items = izin ? hasil.daftar_item.filter((i) => izin.includes(i.kategori_alert)) : hasil.daftar_item;
  if (limit) items = items.slice(0, Number(limit));
  return { ...hasil, daftar_item: items };
}

/**
 * Notifikasi lonceng header. Satu notifikasi per batch dengan prioritas:
 * lewat batas > mendesak retur > stok tipis (sama seperti frontend getHeaderNotifications).
 */
function notifikasiHeader(hasil) {
  const sudah = new Set();
  const out = [];
  const tambah = (i, n) => {
    if (sudah.has(i.batch_id)) return;
    sudah.add(i.batch_id);
    out.push({ nama_obat: i.nama_obat, nomor_batch: i.nomor_batch, batch_id: i.batch_id, targetPage: 'pengingat', ...n });
  };
  for (const i of hasil.daftar.lewat_batas_retur) {
    tambah(i, { id: `exp-ret-${i.batch_id}`, type: 'lewat_batas', tone: 'rose', title: 'Batas Retur Terlewat', detail: `${i.distributor} • Batas ${i.batas_retur}` });
  }
  for (const i of hasil.daftar.mendesak_retur) {
    tambah(i, {
      id: `warn-ret-${i.batch_id}`,
      type: 'wajib_retur',
      tone: 'amber',
      title: i.sisa_hari_retur === 0 ? 'Batas Retur Hari Ini' : `Retur Sisa ${i.sisa_hari_retur} Hari`,
      detail: `${i.distributor} • ${i.sisa_stok} unit`,
    });
  }
  for (const i of hasil.daftar.stok_menipis) {
    tambah(i, { id: `low-${i.batch_id}`, type: 'stok_tipis', tone: 'teal', title: `Stok Tipis (${i.sisa_stok} unit)`, detail: `${i.distributor}` });
  }
  return out;
}

module.exports = { KATEGORI, susunPengingat, saringTipe, notifikasiHeader, tglIndo };
