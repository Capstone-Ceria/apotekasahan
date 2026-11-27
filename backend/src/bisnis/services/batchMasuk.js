'use strict';

const tgl = require('../lib/tanggal');
const uang = require('../lib/uang');
const { galat } = require('../lib/galat');
const retur = require('../domain/retur');
const { STATUS_RISIKO, KETERANGAN_BELUM } = require('../domain/risiko');

/**
 * TITIK SAMBUNG dengan endpoint POST /faktur/simpan-batch milik Charlene. [A-21]
 *
 * Alur yang diusulkan:
 *   1. const siap = await bisnis.batchMasuk.siapkan({ distributor_id, tanggal_masuk, items })
 *      -> validasi + hitung nilai_total, batas_retur, status_retur, status_risiko awal.
 *   2. Charlene INSERT `siap.baris` ke tabel batch di transaksinya sendiri.
 *   3. Setelah COMMIT: await bisnis.batchMasuk.setelahTersimpan(idBatchBaru)
 *      -> panggil prediksi; kalau gagal batch tetap tersimpan dengan "Skor belum tersedia".
 */
function buatLayananBatchMasuk(ctx) {
  const { repo, konfigurasi } = ctx;

  function validasiItem(item, i, { tanggal_masuk, tanggal_acuan }) {
    const detail = [];
    const f = (nama) => `items[${i}].${nama}`;
    if (!item.nomor_batch || !String(item.nomor_batch).trim()) detail.push({ field: f('nomor_batch'), pesan: 'Kolom ini wajib diisi' });
    if (!tgl.valid(item.tanggal_kedaluwarsa)) {
      detail.push({ field: f('tanggal_kedaluwarsa'), pesan: 'Tanggal kedaluwarsa wajib diisi dengan format YYYY-MM-DD' });
    } else {
      // TC-INP-007. "Tanggal saat ini" = tanggal acuan sistem [A-22]
      if (tgl.bandingkan(item.tanggal_kedaluwarsa, tanggal_acuan) < 0) {
        detail.push({ field: f('tanggal_kedaluwarsa'), pesan: 'Tanggal kedaluwarsa tidak boleh lebih lampau dari tanggal saat ini' });
      }
      if (tanggal_masuk && tgl.bandingkan(item.tanggal_kedaluwarsa, tanggal_masuk) < 0) {
        detail.push({ field: f('tanggal_kedaluwarsa'), pesan: 'Tanggal kedaluwarsa tidak boleh lebih lampau dari tanggal masuk' });
      }
    }
    const jumlah = Number(item.jumlah);
    if (!Number.isInteger(jumlah) || jumlah <= 0) detail.push({ field: f('jumlah'), pesan: 'Jumlah harus bilangan bulat lebih dari 0' });
    const harga = Number(item.harga_beli_satuan);
    if (!Number.isFinite(harga) || harga < 0) detail.push({ field: f('harga_beli_satuan'), pesan: 'Harga beli tidak boleh negatif' });
    return detail;
  }

  async function siapkan({ distributor_id, tanggal_masuk, items }) {
    const pengaturan = await ctx.pengaturan.ambil();
    if (!Array.isArray(items) || items.length === 0) throw galat.validasi('Daftar item kosong', [{ field: 'items', pesan: 'Minimal satu item' }]);
    if (!tgl.valid(tanggal_masuk)) throw galat.validasi('Validasi input gagal', [{ field: 'tanggal_masuk', pesan: 'Format YYYY-MM-DD' }]);
    const detail = items.flatMap((it, i) => validasiItem(it, i, { tanggal_masuk, tanggal_acuan: pengaturan.tanggal_acuan }));
    if (detail.length) throw galat.validasi('Validasi input gagal', detail);

    const aturan = await repo.ambilAturanRetur(distributor_id);
    const baris = items.map((it) => {
      const jumlah = Number(it.jumlah);
      const kolom = retur.hitungKolomRetur(
        { tanggal_kedaluwarsa: it.tanggal_kedaluwarsa },
        aturan,
        pengaturan.tanggal_acuan,
        konfigurasi
      );
      return {
        ...it,
        distributor_id: Number(distributor_id),
        tanggal_masuk: tgl.normalisasi(tanggal_masuk),
        tanggal_kedaluwarsa: tgl.normalisasi(it.tanggal_kedaluwarsa),
        jumlah_awal: jumlah,
        jumlah_saat_ini: jumlah,
        harga_beli_satuan: Number(it.harga_beli_satuan),
        nilai_total: uang.dariSen(uang.nilaiBatchSen(jumlah, it.harga_beli_satuan)),
        batas_retur: kolom.batas_retur,
        status_retur: kolom.status_retur,
        skor_risiko: null,
        status_risiko: STATUS_RISIKO.BELUM,
        keterangan: KETERANGAN_BELUM,
      };
    });
    return { baris, aturan_retur_bulan: retur.bulanAturan(aturan, konfigurasi), tanggal_acuan: pengaturan.tanggal_acuan };
  }

  /** Dipanggil SETELAH batch tersimpan. Tidak pernah melempar karena prediksi gagal. */
  async function setelahTersimpan(batchIds) {
    const pengaturan = await ctx.pengaturan.ambil();
    const batches = await repo.daftarBatch({ ids: batchIds });
    const hasil = [];
    for (const b of batches) {
      const skor = await ctx.risiko.hitungDanSimpan(b, pengaturan);
      hasil.push({ id: b.id, ...skor });
    }
    return hasil;
  }

  return { siapkan, setelahTersimpan, validasiItem };
}

module.exports = { buatLayananBatchMasuk };
