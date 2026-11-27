'use strict';

const Joi = require('joi');

const tanggal = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({
  'string.pattern.base': 'Format tanggal harus YYYY-MM-DD',
});

const pesanUmum = {
  'any.required': 'Kolom ini wajib diisi',
  'number.base': 'Harus berupa angka',
  'number.integer': 'Harus bilangan bulat',
  'number.min': 'Tidak boleh kurang dari {#limit}',
  'number.max': 'Tidak boleh lebih dari {#limit}',
  'object.min': 'Minimal satu pengaturan harus diisi',
  'object.unknown': 'Kolom {#label} tidak dikenal',
};

function buatSkema(konfigurasi) {
  return {
    ubahPengaturan: Joi.object({
      tanggal_acuan: tanggal,
      stok_minimum_default: Joi.number().integer().min(0).max(100000),
      batas_kedaluwarsa_warning_hari: Joi.number().integer().min(0).max(3650),
      batas_retur_warning_hari: Joi.number().integer().min(0).max(3650),
    })
      .min(1)
      .messages(pesanUmum),

    ubahAturanRetur: Joi.object({
      bulan_sebelum_kedaluwarsa: Joi.number()
        .integer()
        .valid(...konfigurasi.retur.pilihanBulan)
        .required()
        .messages({ ...pesanUmum, 'any.only': `Pilihan yang diizinkan: ${konfigurasi.retur.pilihanBulan.join(', ')} bulan` }),
      keterangan: Joi.string().allow('', null).max(500),
    }).messages(pesanUmum),

    paramDistributor: Joi.object({ distributor_id: Joi.number().integer().min(1).required() }),
    paramId: Joi.object({ id: Joi.number().integer().min(1).required() }),

    penyesuaian: Joi.object({
      batch_id: Joi.number().integer().min(1).required(),
      // Angka negatif diloloskan ke domain supaya kode error 422 ERR_INVALID_STOCK_VALUE
      // sesuai kontrak (bukan 400 validasi).
      jumlah_sesudah: Joi.number().integer().required(),
      alasan: Joi.string().allow('', null).max(500),
    }).messages(pesanUmum),

    queryPengingat: Joi.object({
      tipe: Joi.string().valid('semua', 'retur', 'lewat_batas', 'kedaluwarsa', 'stok_menipis').default('semua'),
      limit: Joi.number().integer().min(1).max(5000),
    }),

    queryBatch: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(500).default(20),
      search: Joi.string().allow('').max(100),
      distributor_id: Joi.number().integer().min(1),
      obat_id: Joi.number().integer().min(1),
      kategori: Joi.string().max(50),
      status_risiko: Joi.string().valid('rendah', 'sedang', 'tinggi', 'belum_tersedia'),
      status_retur: Joi.string().valid('bisa_diretur', 'lewat_batas', 'tidak_bisa_diretur', 'sudah_diretur', 'dibuang'),
      exp_start: tanggal,
      exp_end: tanggal,
      sort_by: Joi.string().valid('tanggal_kedaluwarsa', 'batas_retur', 'skor_risiko', 'jumlah_saat_ini', 'nilai_total', 'nomor_batch'),
      order: Joi.string().valid('asc', 'desc').default('asc'),
      hanya_aktif: Joi.boolean().default(true),
    }),

    hitungUlangSkor: Joi.object({
      batch_ids: Joi.array().items(Joi.number().integer().min(1)).max(5000),
      hanya_belum_tersedia: Joi.boolean().default(true),
    }),
  };
}

module.exports = { buatSkema };
