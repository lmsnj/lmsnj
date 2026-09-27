// Ikon & warna kartu mapel. Dipisah dari komponen agar bisa dipakai bersama (kartu kelas, materi).
import {
  Atom,
  BookHeart,
  BookMarked,
  BookOpen,
  Briefcase,
  Calculator,
  Code2,
  Database,
  Dna,
  Dumbbell,
  FlaskConical,
  Landmark,
  Languages,
  Network,
  Palette,
  ScrollText,
} from 'lucide-react'
import { subjectIconKey } from './materialFilters'

// Ikon + warna per jenis mapel (kunci dari subjectIconKey): `tile` = kotak ikon, `soft` = latar muda.
const SUBJECT_STYLES = {
  math: { icon: Calculator, tile: 'bg-orange-500', soft: 'bg-orange-50' },
  english: { icon: Languages, tile: 'bg-blue-600', soft: 'bg-blue-50' },
  arabic: { icon: ScrollText, tile: 'bg-emerald-600', soft: 'bg-emerald-50' },
  religion: { icon: BookHeart, tile: 'bg-teal-600', soft: 'bg-teal-50' },
  language: { icon: BookOpen, tile: 'bg-red-500', soft: 'bg-red-50' },
  database: { icon: Database, tile: 'bg-violet-600', soft: 'bg-violet-50' },
  network: { icon: Network, tile: 'bg-sky-600', soft: 'bg-sky-50' },
  code: { icon: Code2, tile: 'bg-slate-800', soft: 'bg-indigo-50' },
  biology: { icon: Dna, tile: 'bg-indigo-500', soft: 'bg-indigo-50' },
  chemistry: { icon: FlaskConical, tile: 'bg-fuchsia-600', soft: 'bg-fuchsia-50' },
  physics: { icon: Atom, tile: 'bg-cyan-600', soft: 'bg-cyan-50' },
  history: { icon: Landmark, tile: 'bg-amber-700', soft: 'bg-amber-50' },
  art: { icon: Palette, tile: 'bg-pink-500', soft: 'bg-pink-50' },
  sport: { icon: Dumbbell, tile: 'bg-lime-600', soft: 'bg-lime-50' },
  business: { icon: Briefcase, tile: 'bg-yellow-600', soft: 'bg-yellow-50' },
  default: { icon: BookMarked, tile: 'bg-brand-600', soft: 'bg-brand-50' },
}

export const subjectStyle = (name) => SUBJECT_STYLES[subjectIconKey(name)]
