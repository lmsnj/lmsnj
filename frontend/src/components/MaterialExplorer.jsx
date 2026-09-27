import {
  Atom,
  Calculator,
  Code2,
  FileText,
  FlaskConical,
  Globe,
  GraduationCap,
  Languages,
  Lightbulb,
  Link2,
  PlayCircle,
  Sprout,
} from 'lucide-react'
import useBranding from '../hooks/useBranding'
import { filterChips } from '../utils/listFilters'
import { FilterChips, OptionPanel, SubjectPanel } from './ExplorePanels'
import PageHero from './PageHero'

const MATERIAL_TYPE_OPTIONS = [
  {
    id: 'pdf',
    title: 'Modul & Dokumen',
    description: 'Baca modul dan bahan ajar PDF dari guru',
    icon: FileText,
    tile: 'bg-red-100 text-red-600',
  },
  {
    id: 'video',
    title: 'Video Pembelajaran',
    description: 'Tonton penjelasan materi kapan saja',
    icon: PlayCircle,
    tile: 'bg-blue-100 text-blue-600',
  },
  {
    id: 'link',
    title: 'Tautan Belajar',
    description: 'Sumber belajar pilihan dari internet',
    icon: Link2,
    tile: 'bg-emerald-100 text-emerald-600',
  },
]

const HERO_ICONS = [Calculator, FlaskConical, Code2, Globe, Languages, Atom, Lightbulb]

/**
 * Bagian atas halaman "Materi Pembelajaran": banner pencarian, "Pilihan Mata Pelajaran", dan
 * "Eksplorasi Tipe Materi". Kartu = tombol penyaring (klik lagi untuk membatalkan).
 * - `assignments`: daftar pengampu (mapel di kelas) milik pengguna
 * - `subjectCounts` / `typeCounts`: jumlah materi per pengampu / per tipe
 * - `filters` & `onChange(filters)`: { search, assignment, type }
 * - `assignmentLabel(a)` / `assignmentSublabel(a)`: teks kartu mapel
 * - `onSearchSubmit`: dipanggil saat tombol Cari ditekan (mis. menggulir ke hasil)
 */
export default function MaterialExplorer({
  title = 'Materi Pembelajaran',
  description,
  note,
  total,
  assignments,
  subjectCounts,
  typeCounts,
  filters,
  onChange,
  assignmentLabel = (a) => a.subject_name,
  assignmentSublabel,
  onSearchSubmit,
}) {
  const { branding } = useBranding()
  const set = (changes) => onChange({ ...filters, ...changes })
  return (
    <div className="space-y-6">
      <PageHero
        title={title}
        description={description}
        icons={HERO_ICONS}
        centerIcon={GraduationCap}
        search={{
          value: filters.search,
          onChange: (search) => set({ search }),
          onSubmit: onSearchSubmit,
          placeholder: 'Cari judul materi...',
        }}
        stats={[
          {
            icon: GraduationCap,
            content: note ?? (
              <>
                Materi dari guru <strong className="text-white">{branding.school_name}</strong>
              </>
            ),
          },
          {
            icon: Sprout,
            content: (
              <>
                <strong className="text-white">{total} materi</strong> dan akan terus bertambah
              </>
            ),
          },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <SubjectPanel
          assignments={assignments}
          counts={subjectCounts}
          unit="materi"
          selected={filters.assignment}
          onSelect={(assignment) => set({ assignment })}
          label={assignmentLabel}
          sublabel={assignmentSublabel}
        />
        <OptionPanel
          title="Eksplorasi Tipe Materi"
          options={MATERIAL_TYPE_OPTIONS}
          counts={typeCounts}
          selected={filters.type}
          onSelect={(type) => set({ type })}
          resetLabel="Semua Tipe"
        />
      </div>
    </div>
  )
}

/** Judul hasil + label penyaring aktif (bisa dihapus satu per satu). */
export function FilterSummary({
  filters,
  onChange,
  assignments,
  count,
  assignmentLabel,
  className = 'mb-4',
}) {
  // Penyaring materi memakai kunci `type`; filterChips memakai `status`.
  const chips = filterChips(
    { ...filters, status: filters.type },
    { assignments, assignmentLabel, options: MATERIAL_TYPE_OPTIONS },
  )
  return (
    <FilterChips
      count={count}
      chips={chips}
      className={className}
      onRemove={(key) => onChange({ ...filters, [key === 'status' ? 'type' : key]: '' })}
      onClear={() => onChange({ search: '', assignment: '', type: '' })}
    />
  )
}
