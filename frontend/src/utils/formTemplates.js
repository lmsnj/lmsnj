// Contoh isian cepat untuk form guru & admin (tombol "Gunakan contoh").
// Setiap contoh berisi nilai untuk satu atau beberapa field form; guru tinggal menyesuaikan.

export const TASK_TEMPLATES = [
  {
    label: 'Tugas praktik',
    values: {
      instructions: `Tujuan:
- ...

Langkah kerja:
1. ...
2. ...
3. ...

Yang dikumpulkan:
- File hasil praktik (.zip) dan tangkapan layar hasil akhir.

Kriteria penilaian:
- Hasil berjalan sesuai tujuan (40%)
- Kerapian & struktur (30%)
- Ketepatan waktu (30%)`,
    },
  },
  {
    label: 'Laporan / makalah',
    values: {
      instructions: `Buat laporan tentang: ...

Sistematika:
1. Pendahuluan
2. Pembahasan
3. Kesimpulan
4. Daftar pustaka

Ketentuan:
- Diketik rapi, minimal 2 halaman.
- Dikumpulkan dalam format PDF.`,
    },
  },
  {
    label: 'Rangkuman materi',
    values: {
      instructions: `Rangkum materi "..." dengan poin-poin berikut:
1. Pengertian
2. Contoh
3. Kesimpulan pribadi

Boleh ditulis di kolom jawaban teks, atau difoto (JPG/PNG) jika ditulis tangan.`,
    },
  },
  {
    label: 'Latihan soal hitungan',
    values: {
      instructions: `Kerjakan soal berikut dengan menuliskan langkah-langkahnya:
1. Hitung $\\frac{1}{2} + \\frac{3}{4}$
2. Tentukan nilai $x$ jika $2x + 3 = 11$

Tulis jawaban di kolom teks, atau foto lembar jawaban Anda.`,
    },
  },
]

export const MATERIAL_TEMPLATES = [
  { label: 'Modul bacaan', values: { description: 'Baca modul ini sebelum pertemuan berikutnya. Catat bagian yang belum dipahami untuk ditanyakan di kelas.' } },
  { label: 'Video pembelajaran', values: { description: 'Tonton video sampai selesai, lalu tuliskan 3 hal penting yang Anda pelajari.' } },
  { label: 'Referensi tambahan', values: { description: 'Bacaan tambahan (tidak wajib) untuk memperdalam materi.' } },
] // prettier-ignore

export const SESSION_TEMPLATES = [
  {
    label: 'Praktik di lab',
    values: {
      mode: 'offline',
      description: 'Bawa laptop/flashdisk. Datang 5 menit sebelum mulai.',
    },
  },
  {
    label: 'Kelas online',
    values: {
      mode: 'online',
      description:
        'Link aktif 10 menit sebelum mulai. Nyalakan kamera saat presensi, matikan mikrofon saat guru menjelaskan.',
    },
  },
  {
    label: 'Ulangan / asesmen',
    values: { mode: 'offline', description: 'Pelajari materi bab sebelumnya. Bawa alat tulis.' },
  },
]

export const ANNOUNCEMENT_TEMPLATES = [
  {
    label: 'Libur sekolah',
    values: {
      title: 'Libur ...',
      body: 'Diberitahukan bahwa kegiatan belajar mengajar diliburkan pada tanggal ... dalam rangka .... Kegiatan belajar dimulai kembali pada tanggal ....',
    },
  },
  {
    label: 'Jadwal ujian',
    values: {
      title: 'Jadwal Penilaian ...',
      body: 'Penilaian ... dilaksanakan pada:\nHari/tanggal: ...\nWaktu: ...\nTempat: ...\n\nSiswa wajib hadir 15 menit sebelum dimulai.',
    },
  },
  {
    label: 'Pengumpulan tugas',
    values: {
      title: 'Pengingat: batas pengumpulan tugas ...',
      body: 'Tugas "..." dikumpulkan paling lambat ... melalui menu Tugas. Pengumpulan setelah tenggat akan ditandai terlambat.',
    },
  },
  {
    label: 'Kegiatan sekolah',
    values: {
      title: 'Kegiatan ...',
      body: 'Dalam rangka ..., sekolah mengadakan kegiatan ... pada:\nHari/tanggal: ...\nTempat: ...\nPakaian: ...',
    },
  },
]
