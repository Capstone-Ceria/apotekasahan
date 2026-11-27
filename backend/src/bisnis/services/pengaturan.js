'use strict';

const tgl = require('../lib/tanggal');
const { galat } = require('../lib/galat');
const retur = require('../domain/retur');

const KUNCI_ANGKA = ['stok_minimum_default', 'batas_kedaluwarsa_warning_hari', 'batas_retur_warning_hari'];

function buatLayananPengaturan(ctx) {
  const { repo, konfigurasi } = ctx;

  /** Baca tabel pengaturan, ubah ke tipe yang benar, isi yang kosong dengan default. */
  async function ambil(r = repo) {
    const mentah = await r.ambilPengaturan();
    const hasil = { ...konfigurasi.pengaturanAwal };
    if (mentah.tanggal_acuan && tgl.valid(mentah.tanggal_acuan)) hasil.tanggal_acuan = tgl.normalisasi(mentah.tanggal_acuan);
    for (const k of KUNCI_ANGKA) {
      const n = Number(mentah[k]);
      if (mentah[k] !== undefined && Number.isFinite(n)) hasil[k] = n;
    }
    return hasil;
  }

  /**
   * Hitung ulang batas_retur + status_retur untuk banyak batch dan simpan
   * hanya yang berubah. Dipakai saat aturan retur atau tanggal acuan berubah.
   */
  async function segarkanKolomRetur(r, batches, pengaturan, aturanTimpa) {
    let berubah = 0;
    const ids = [];
    for (const b of batches) {
      if (retur.STATUS_TERMINAL.has(b.status_retur)) continue;
      const aturan = aturanTimpa !== undefined ? aturanTimpa : b.aturan_retur_bulan;
      const kolom = retur.hitungKolomRetur(b, aturan, pengaturan.tanggal_acuan, konfigurasi);
      if (kolom.batas_retur !== tgl.normalisasi(b.batas_retur) || kolom.status_retur !== b.status_retur) {
        await r.perbaruiBatch(b.id, { batas_retur: kolom.batas_retur, status_retur: kolom.status_retur });
        berubah += 1;
      }
      ids.push(b.id);
    }
    return { berubah, ids };
  }

  async function ubah(perubahan) {
    const lama = await ambil();
    const baru = { ...lama, ...perubahan };
    const tanggalBerubah = perubahan.tanggal_acuan !== undefined && perubahan.tanggal_acuan !== lama.tanggal_acuan;

    const hasil = await repo.transaksi(async (r) => {
      await r.simpanPengaturan(perubahan);
      if (!tanggalBerubah) return { berubah: 0, ids: [] };
      // Status retur tersimpan di DB ikut disegarkan supaya query/index tetap benar.
      const batches = await r.daftarBatch({ hanya_aktif: true });
      return segarkanKolomRetur(r, batches, baru, undefined);
    });

    let skor = null;
    if (tanggalBerubah && konfigurasi.risiko.hitungUlangSaatTanggalAcuanBerubah && hasil.ids.length) {
      skor = ctx.jadwalkanHitungUlangSkor(hasil.ids);
    }
    return {
      pengaturan: await ambil(),
      batch_status_retur_berubah: hasil.berubah,
      hitung_ulang_skor: skor,
    };
  }

  async function daftarAturanRetur() {
    const list = await repo.daftarAturanRetur();
    return list.map((a) => ({
      ...a,
      bulan_sebelum_kedaluwarsa:
        a.bulan_sebelum_kedaluwarsa === null || a.bulan_sebelum_kedaluwarsa === undefined
          ? null
          : Number(a.bulan_sebelum_kedaluwarsa),
      bulan_efektif: retur.bulanAturan(a.bulan_sebelum_kedaluwarsa, konfigurasi),
      memakai_default: a.bulan_sebelum_kedaluwarsa === null || a.bulan_sebelum_kedaluwarsa === undefined,
    }));
  }

  /** TC-REM-004: ubah aturan retur => semua batch distributor itu dihitung ulang. */
  async function ubahAturanRetur(distributorId, { bulan_sebelum_kedaluwarsa, keterangan }) {
    const bulan = Number(bulan_sebelum_kedaluwarsa);
    if (!konfigurasi.retur.pilihanBulan.includes(bulan)) {
      throw galat.validasi('Aturan retur tidak valid', [
        { field: 'bulan_sebelum_kedaluwarsa', pesan: `Pilihan yang diizinkan: ${konfigurasi.retur.pilihanBulan.join(', ')} bulan` },
      ]);
    }
    const distributor = await repo.ambilDistributor(distributorId);
    if (!distributor) throw galat.tidakDitemukan('Distributor tidak ditemukan');
    const pengaturan = await ambil();

    const hasil = await repo.transaksi(async (r) => {
      await r.simpanAturanRetur(distributorId, { bulan_sebelum_kedaluwarsa: bulan, keterangan });
      const batches = await r.daftarBatch({ distributor_id: Number(distributorId) });
      const seg = await segarkanKolomRetur(r, batches, pengaturan, bulan);
      return { ...seg, total: seg.ids.length };
    });

    let skor = null;
    if (konfigurasi.risiko.hitungUlangSaatAturanReturBerubah && hasil.ids.length) {
      skor = ctx.jadwalkanHitungUlangSkor(hasil.ids);
    }
    return {
      distributor_id: Number(distributorId),
      bulan_sebelum_kedaluwarsa: bulan,
      total_batch_terdampak: hasil.total,
      total_batch_berubah: hasil.berubah,
      hitung_ulang_skor: skor,
    };
  }

  return { ambil, ubah, daftarAturanRetur, ubahAturanRetur };
}

module.exports = { buatLayananPengaturan };
