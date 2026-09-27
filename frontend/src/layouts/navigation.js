import {
  BookOpen,
  ChartColumn,
  ClipboardCheck,
  ClipboardPen,
  GraduationCap,
  House,
  Library,
  Megaphone,
  MessagesSquare,
  Presentation,
  School,
  Trophy,
  UserRound,
  Users,
} from 'lucide-react'
import { ROLES } from '../utils/constants'

/**
 * Menu navigasi per peran. Satu-satunya tempat mengatur menu.
 *
 * - `to`   : halaman yang SUDAH ada.
 * - `soon` : fitur belum dibuat -> tampil nonaktif dengan label "Segera" (jangan diberi `to`).
 * - `end`  : aktif hanya jika alamatnya persis sama (untuk Beranda).
 * - `more` : item yang dimasukkan ke dropdown "Lainnya".
 */
const PROFILE = { label: 'Profil Saya', icon: UserRound, to: '/profil' }

export const NAVIGATION = {
  [ROLES.ADMIN]: {
    main: [
      { label: 'Beranda', icon: House, to: '/admin', end: true },
      { label: 'Pengguna', icon: Users, to: '/admin/pengguna' },
      { label: 'Ruang Kelas', icon: School, to: '/admin/kelas' },
      { label: 'Mata Pelajaran', icon: Library, to: '/admin/mapel' },
      { label: 'Pengampu', icon: GraduationCap, to: '/admin/pengampu' },
    ],
    more: [
      PROFILE,
      { label: 'Laporan', icon: ChartColumn, soon: true },
      { label: 'Pengumuman Sekolah', icon: Megaphone, soon: true },
      { label: 'Ruang Obrolan', icon: MessagesSquare, soon: true },
    ],
  },
  [ROLES.TEACHER]: {
    main: [
      { label: 'Beranda', icon: House, to: '/guru', end: true },
      { label: 'Ruang Kelas', icon: School, to: '/guru/kelas' },
      { label: 'Materi Pembelajaran', icon: BookOpen, to: '/guru/materi' },
      { label: 'Tugas & Nilai', icon: ClipboardCheck, to: '/guru/tugas' },
      { label: 'Lembar Asesmen', icon: ClipboardPen, soon: true },
      { label: 'Ruang Obrolan', icon: MessagesSquare, soon: true },
    ],
    more: [
      PROFILE,
      { label: 'Pengumuman', icon: Megaphone, soon: true },
      { label: 'Sesi Mengajar', icon: Presentation, soon: true },
    ],
  },
  [ROLES.STUDENT]: {
    main: [
      { label: 'Beranda', icon: House, to: '/siswa', end: true },
      { label: 'Ruang Kelas', icon: School, to: '/siswa/mapel' },
      { label: 'Materi Pembelajaran', icon: BookOpen, to: '/siswa/materi' },
      { label: 'Tugas', icon: ClipboardCheck, to: '/siswa/tugas' },
      { label: 'Lembar Asesmen', icon: ClipboardPen, soon: true },
      { label: 'Ruang Obrolan', icon: MessagesSquare, soon: true },
    ],
    more: [
      { label: 'Nilai & Progres', icon: Trophy, to: '/siswa/nilai' },
      PROFILE,
      { label: 'Pengumuman', icon: Megaphone, soon: true },
    ],
  },
}
