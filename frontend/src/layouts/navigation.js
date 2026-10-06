import {
  BookOpen,
  CalendarClock,
  CalendarSync,
  ChartColumn,
  ClipboardCheck,
  ClipboardPen,
  GraduationCap,
  House,
  Library,
  Megaphone,
  MessagesSquare,
  Building2,
  Palette,
  School,
  Trophy,
  UserRound,
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
 * - `more`  : item yang dimasukkan ke dropdown "Lainnya".
 */
const PROFILE = { label: 'Profil Saya', icon: UserRound, to: '/profil' }
const CHAT = { label: 'Ruang Obrolan', icon: MessagesSquare, to: '/obrolan', badge: 'chat' }
const ANNOUNCEMENTS = { label: 'Pengumuman', icon: Megaphone, to: '/pengumuman' }

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
  { label: 'Laporan Nilai', icon: ChartColumn, to: '/admin/laporan' },
  { ...ANNOUNCEMENTS, label: 'Pengumuman Sekolah' },
  { label: 'Tahun Ajaran Baru', icon: CalendarSync, to: '/admin/tahun-ajaran' },
]
// Admin sekolah: identitas sekolahnya. Admin yayasan: identitas yayasan/aplikasi (halaman sama).
const IDENTITY = { label: 'Identitas Sekolah', icon: Palette, to: '/admin/identitas' }

export const NAVIGATION = {
  [ROLES.FOUNDATION]: {
    main: [
      ADMIN_MAIN[0],
      { label: 'Daftar Sekolah', icon: Building2, to: '/admin/sekolah' },
      ...ADMIN_MAIN.slice(1),
    ],
    more: [...ADMIN_MORE, { ...IDENTITY, label: 'Identitas Yayasan' }, PROFILE],
  },
  [ROLES.ADMIN]: {
    main: ADMIN_MAIN,
    more: [...ADMIN_MORE, IDENTITY, PROFILE],
  },
  [ROLES.TEACHER]: {
    main: [
      { label: 'Beranda', icon: House, to: '/guru', end: true },
      { label: 'Ruang Kelas', icon: School, to: '/guru/kelas' },
      { label: 'Materi Pembelajaran', icon: BookOpen, to: '/guru/materi' },
      { label: 'Tugas & Nilai', icon: ClipboardCheck, to: '/guru/tugas' },
      { label: 'Lembar Asesmen', icon: ClipboardPen, to: '/guru/asesmen' },
      CHAT,
    ],
    more: [
      ANNOUNCEMENTS,
      { label: 'Sesi Mengajar', icon: CalendarClock, to: '/guru/sesi' },
      { label: 'Laporan Kelas Wali', icon: ChartColumn, to: '/guru/laporan' },
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
      ANNOUNCEMENTS,
      { label: 'Jadwal Sesi', icon: CalendarClock, to: '/siswa/sesi' },
      PROFILE,
    ],
  },
}
