import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  CalendarSync,
  ChartColumn,
  ChartNoAxesCombined,
  ClipboardCheck,
  ClipboardPen,
  GraduationCap,
  House,
  IdCard,
  LogIn,
  Library,
  Megaphone,
  MessagesSquare,
  Building2,
  Palette,
  School,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  UserCheck,
  UserRound,
  Wallet,
  Users,
} from 'lucide-react'
import { ROLES } from '../utils/constants'

/**
 * Menu navigasi per peran. Satu-satunya tempat mengatur menu.
 *
 * - `to`    : halaman yang SUDAH ada (route di routes/AppRoutes.jsx).
 * - `soon`  : fitur belum dibuat -> tampil nonaktif dengan label "Segera" (jangan diberi `to`).
 * - `end`   : aktif hanya jika alamatnya persis sama (untuk Beranda).
 * - `badge` : 'chat' = tampilkan jumlah pesan belum dibaca.
 * - `more`  : item di bagian "Lainnya" pada sidebar.
 * - `feature`: kode fitur baru (registry.py backend); item hanya tampil jika fitur itu menyala di
 *              sekolah aktif (disaring DashboardLayout lewat utils/settings.js::filterNavByFeatures).
 */
const PROFILE = { label: 'Profil Saya', icon: UserRound, to: '/profil' }
const CHAT = { label: 'Ruang Obrolan', icon: MessagesSquare, to: '/obrolan', badge: 'chat' }
const TIMETABLE = { label: 'Jadwal Pelajaran', icon: CalendarDays }
const ANNOUNCEMENTS = { label: 'Pengumuman', icon: Megaphone, to: '/pengumuman' }

// Studio Media Interaktif; di mode yayasan = Pustaka Media global.
const MEDIA_STUDIO = { label: 'Media Interaktif', icon: Sparkles, to: '/admin/media-interaktif' }

// Menu admin dipakai juga oleh admin yayasan (di sekolah yang sedang dibuka).
const ADMIN_MAIN = [
  { label: 'Beranda', icon: House, to: '/admin', end: true },
  { label: 'Pengguna', icon: Users, to: '/admin/pengguna' },
  { label: 'Ruang Kelas', icon: School, to: '/admin/kelas' },
  { label: 'Mata Pelajaran', icon: Library, to: '/admin/mapel' },
  { label: 'Pengampu', icon: GraduationCap, to: '/admin/pengampu' },
  CHAT,
]
const ADMIN_MORE = [
  { ...TIMETABLE, to: '/admin/jadwal' },
  { label: 'Statistik Sekolah', icon: ChartNoAxesCombined, to: '/admin/statistik' },
  { label: 'Laporan Nilai', icon: ChartColumn, to: '/admin/laporan' },
  { label: 'Rekap Presensi', icon: UserCheck, to: '/admin/presensi' },
  { label: 'Status Pembayaran', icon: Wallet, to: '/admin/pembayaran' },
  { label: 'Ujian & Kartu Ujian', icon: IdCard, to: '/admin/ujian' },
  { ...ANNOUNCEMENTS, label: 'Pengumuman Sekolah' },
  { label: 'Tahun Ajaran Baru', icon: CalendarSync, to: '/admin/tahun-ajaran' },
  MEDIA_STUDIO,
]
// Identitas sekolah yang sedang dibuka; di mode yayasan halaman yang sama = identitas yayasan.
const IDENTITY = { label: 'Identitas Sekolah', icon: Palette, to: '/admin/identitas' }
// Aturan penilaian, kuis, LKPD & saklar fitur sekolah yang dibuka (apps/school_settings).
const LEARNING_SETTINGS = {
  label: 'Pengaturan Pembelajaran',
  icon: SlidersHorizontal,
  to: '/admin/pengaturan-pembelajaran',
}
const SCHOOL_LIST = { label: 'Daftar Sekolah', icon: Building2, to: '/admin/sekolah' }
// Admin yayasan masuk ke akun pengguna lain (lihat pages/admin/ImpersonatePage.jsx).
const IMPERSONATE = { label: 'Masuk sebagai Pengguna', icon: LogIn, to: '/admin/masuk-sebagai' }

// Admin yayasan punya dua mode:
// - mode yayasan (belum membuka sekolah): ringkasan semua sekolah & pengaturan yayasan;
// - membuka satu sekolah (lewat "Ganti Sekolah"): menu admin sekolah itu.
const FOUNDATION_HOME = {
  main: [
    { label: 'Beranda', icon: House, to: '/admin', end: true },
    SCHOOL_LIST,
    IMPERSONATE,
    { ...MEDIA_STUDIO, label: 'Pustaka Media' },
    CHAT,
  ],
  more: [{ ...IDENTITY, label: 'Identitas Aplikasi' }, PROFILE],
}

/** Menu untuk user ini. `school` = sekolah yang sedang dibuka (null = mode yayasan). */
export function navigationFor(role, school) {
  if (role !== ROLES.FOUNDATION) return NAVIGATION[role]
  if (!school) return FOUNDATION_HOME
  return {
    main: ADMIN_MAIN,
    more: [...ADMIN_MORE, IDENTITY, LEARNING_SETTINGS, SCHOOL_LIST, IMPERSONATE, PROFILE],
  }
}

export const NAVIGATION = {
  [ROLES.ADMIN]: {
    main: ADMIN_MAIN,
    more: [...ADMIN_MORE, IDENTITY, LEARNING_SETTINGS, PROFILE],
  },
  [ROLES.TEACHER]: {
    main: [
      { label: 'Beranda', icon: House, to: '/guru', end: true },
      { label: 'Ruang Kelas', icon: School, to: '/guru/kelas' },
      { label: 'Materi Pembelajaran', icon: BookOpen, to: '/guru/materi' },
      { label: 'Media Interaktif', icon: Sparkles, to: '/guru/media-interaktif' },
      { label: 'Tugas & Nilai', icon: ClipboardCheck, to: '/guru/tugas' },
      { label: 'Lembar Asesmen', icon: ClipboardPen, to: '/guru/asesmen' },
      CHAT,
    ],
    more: [
      ANNOUNCEMENTS,
      { ...TIMETABLE, to: '/guru/jadwal' },
      { label: 'Sesi Mengajar', icon: CalendarClock, to: '/guru/sesi' },
      { label: 'Laporan Kelas Wali', icon: ChartColumn, to: '/guru/laporan' },
      { label: 'Presensi Kelas Wali', icon: UserCheck, to: '/guru/presensi' },
      { label: 'Kartu Ujian Kelas Wali', icon: IdCard, to: '/guru/ujian' },
      PROFILE,
    ],
  },
  [ROLES.STUDENT]: {
    main: [
      { label: 'Beranda', icon: House, to: '/siswa', end: true },
      { label: 'Ruang Kelas', icon: School, to: '/siswa/mapel' },
      { label: 'Materi Pembelajaran', icon: BookOpen, to: '/siswa/materi' },
      { label: 'Tugas', icon: ClipboardCheck, to: '/siswa/tugas' },
      { label: 'Lembar Asesmen', icon: ClipboardPen, to: '/siswa/asesmen' },
      CHAT,
    ],
    more: [
      { label: 'Nilai & Progres', icon: Trophy, to: '/siswa/nilai' },
      { label: 'Kehadiran Saya', icon: UserCheck, to: '/siswa/presensi' },
      ANNOUNCEMENTS,
      { ...TIMETABLE, to: '/siswa/jadwal' },
      { label: 'Jadwal Sesi', icon: CalendarClock, to: '/siswa/sesi' },
      PROFILE,
    ],
  },
}
