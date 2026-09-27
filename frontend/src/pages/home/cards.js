import {
  BookOpen,
  CalendarPlus,
  ChartColumn,
  CircleCheck,
  ClipboardCheck,
  ClipboardPen,
  FileSpreadsheet,
  History,
  Library,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Presentation,
  School,
  Send,
  TrendingUp,
  Trophy,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react'
import { ROLES } from '../../utils/constants'

/**
 * Kartu aksi Beranda per peran (grid 2x2). Setiap kartu punya tepat 2 tombol.
 * Tombol tanpa `to` atau dengan `soon: true` tampil nonaktif ("Segera hadir").
 * Warna: orange | green | slate | blue (lihat components/home/ActionCard.jsx).
 */
export const HOME_CARDS = {
  [ROLES.TEACHER]: [
    {
      title: 'Materi Pelajaran & Lembar Asesmen',
      icon: BookOpen,
      color: 'orange',
      actions: [
        {
          label: 'Buat Lembar Asesmen',
          icon: ClipboardPen,
          soon: true,
          info: 'Membuat soal atau kuis yang dikerjakan siswa secara online.',
        },
        {
          label: 'Unggah Materi',
          icon: Upload,
          to: '/guru/materi?baru=1',
          info: 'Bagikan PDF, video YouTube, atau link ke kelas yang Anda ampu.',
        },
      ],
    },
    {
      title: 'Berikan & Nilai Tugas',
      icon: ClipboardCheck,
      color: 'green',
      actions: [
        {
          label: 'Bagikan Tugas',
          icon: Send,
          to: '/guru/tugas?baru=1',
          info: 'Buat tugas dengan tenggat, lampiran soal, dan nilai maksimal.',
        },
        {
          label: 'Nilai Tugas',
          icon: CircleCheck,
          to: '/guru/tugas?filter=perlu-dinilai',
          info: 'Tampilkan tugas yang jawabannya belum Anda nilai.',
        },
      ],
    },
    {
      title: 'Mengajar & Tinjau Kinerja',
      icon: Presentation,
      color: 'slate',
      actions: [
        {
          label: 'Buat Sesi',
          icon: CalendarPlus,
          soon: true,
          info: 'Menjadwalkan sesi atau pertemuan mengajar.',
        },
        {
          label: 'Kinerja Siswa',
          icon: TrendingUp,
          to: '/guru/kelas',
          info: 'Pilih kelas, lalu buka tab Nilai untuk melihat rekap nilai dan rata-rata siswa.',
        },
      ],
    },
    {
      title: 'Chat & Pengumuman',
      icon: MessagesSquare,
      color: 'blue',
      actions: [
        {
          label: 'Chat dengan Siswa',
          icon: MessageCircle,
          soon: true,
          info: 'Berkirim pesan langsung dengan siswa.',
        },
        {
          label: 'Buat Pengumuman',
          icon: Megaphone,
          soon: true,
          info: 'Menyampaikan pengumuman ke kelas yang Anda ampu.',
        },
      ],
    },
  ],

  [ROLES.STUDENT]: [
    {
      title: 'Materi Saya',
      icon: BookOpen,
      color: 'orange',
      actions: [
        {
          label: 'Lihat Materi',
          icon: BookOpen,
          to: '/siswa/materi',
          info: 'Semua materi dari guru untuk kelas Anda.',
        },
        {
          label: 'Mapel Saya',
          icon: School,
          to: '/siswa/mapel',
          info: 'Daftar mata pelajaran dan guru di kelas Anda.',
        },
      ],
    },
    {
      title: 'Tugas Saya',
      icon: ClipboardCheck,
      color: 'green',
      actions: [
        {
          label: 'Kerjakan Tugas',
          icon: Send,
          to: '/siswa/tugas?status=belum',
          info: 'Tugas yang belum Anda kumpulkan, diurutkan dari tenggat terdekat.',
        },
        {
          label: 'Semua Tugas',
          icon: ClipboardCheck,
          to: '/siswa/tugas',
          info: 'Semua tugas dari semua mata pelajaran.',
        },
      ],
    },
    {
      title: 'Nilai & Progres',
      icon: Trophy,
      color: 'slate',
      actions: [
        {
          label: 'Lihat Nilai',
          icon: Trophy,
          to: '/siswa/nilai',
          info: 'Nilai, umpan balik guru, dan rata-rata Anda.',
        },
        {
          label: 'Riwayat Pengumpulan',
          icon: History,
          to: '/siswa/tugas?status=sudah',
          info: 'Tugas yang sudah Anda kumpulkan.',
        },
      ],
    },
    {
      title: 'Pengumuman',
      icon: Megaphone,
      color: 'blue',
      actions: [
        {
          label: 'Lihat Pengumuman',
          icon: Megaphone,
          soon: true,
          info: 'Pengumuman dari guru dan sekolah.',
        },
        {
          label: 'Chat dengan Guru',
          icon: MessageCircle,
          soon: true,
          info: 'Berkirim pesan langsung dengan guru.',
        },
      ],
    },
  ],

  [ROLES.ADMIN]: [
    {
      title: 'Kelola Pengguna',
      icon: Users,
      color: 'orange',
      actions: [
        {
          label: 'Tambah Pengguna',
          icon: UserPlus,
          to: '/admin/pengguna?baru=1',
          info: 'Tambah satu akun guru, siswa, atau admin.',
        },
        {
          label: 'Impor dari Excel',
          icon: FileSpreadsheet,
          to: '/admin/pengguna?impor=1',
          info: 'Tambah banyak akun sekaligus memakai template Excel.',
        },
      ],
    },
    {
      title: 'Kelola Kelas & Mapel',
      icon: School,
      color: 'green',
      actions: [
        {
          label: 'Kelola Kelas',
          icon: School,
          to: '/admin/kelas',
          info: 'Atur kelas, wali kelas, siswa, dan mapel di setiap kelas.',
        },
        {
          label: 'Kelola Mapel',
          icon: Library,
          to: '/admin/mapel',
          info: 'Daftar mata pelajaran yang diajarkan di sekolah.',
        },
      ],
    },
    {
      title: 'Laporan',
      icon: ChartColumn,
      color: 'slate',
      actions: [
        {
          label: 'Statistik Sekolah',
          icon: ChartColumn,
          to: '/admin#ringkasan',
          info: 'Jumlah pengguna, kelas, materi, tugas, dan hal yang perlu ditindaklanjuti.',
        },
        {
          label: 'Rekap Nilai Sekolah',
          icon: TrendingUp,
          soon: true,
          info: 'Rekap nilai seluruh kelas dalam satu laporan.',
        },
      ],
    },
    {
      title: 'Pengumuman Sekolah',
      icon: Megaphone,
      color: 'blue',
      actions: [
        {
          label: 'Buat Pengumuman',
          icon: Megaphone,
          soon: true,
          info: 'Menyampaikan pengumuman ke seluruh sekolah.',
        },
        {
          label: 'Ruang Obrolan',
          icon: MessagesSquare,
          soon: true,
          info: 'Berkirim pesan dengan guru dan siswa.',
        },
      ],
    },
  ],
}
