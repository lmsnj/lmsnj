import {
  ArrowRight,
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
  FileText,
  FlaskConical,
  Globe,
  GraduationCap,
  Grip,
  Landmark,
  Languages,
  Layers,
  Lightbulb,
  Link2,
  Network,
  Palette,
  PlayCircle,
  ScrollText,
  Search,
  Sprout,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { SCHOOL } from '../utils/constants'
import { subjectIconKey } from '../utils/materialFilters'

// Ikon + warna kartu mapel (kunci dari subjectIconKey).
const SUBJECT_STYLES = {
  math: { icon: Calculator, tile: 'bg-orange-500' },
  english: { icon: Languages, tile: 'bg-blue-600' },
  arabic: { icon: ScrollText, tile: 'bg-emerald-600' },
  religion: { icon: BookHeart, tile: 'bg-teal-600' },
  language: { icon: BookOpen, tile: 'bg-red-500' },
  database: { icon: Database, tile: 'bg-violet-600' },
  network: { icon: Network, tile: 'bg-sky-600' },
  code: { icon: Code2, tile: 'bg-slate-800' },
  biology: { icon: Dna, tile: 'bg-indigo-500' },
  chemistry: { icon: FlaskConical, tile: 'bg-fuchsia-600' },
  physics: { icon: Atom, tile: 'bg-cyan-600' },
  history: { icon: Landmark, tile: 'bg-amber-700' },
  art: { icon: Palette, tile: 'bg-pink-500' },
  sport: { icon: Dumbbell, tile: 'bg-lime-600' },
  business: { icon: Briefcase, tile: 'bg-yellow-600' },
  default: { icon: BookMarked, tile: 'bg-brand-600' },
}

const MATERIAL_TYPE_CARDS = [
  {
    type: 'pdf',
    title: 'Modul & Dokumen',
    description: 'Baca modul dan bahan ajar PDF dari guru',
    icon: FileText,
    tile: 'bg-red-100 text-red-600',
  },
  {
    type: 'video',
    title: 'Video Pembelajaran',
    description: 'Tonton penjelasan materi kapan saja',
    icon: PlayCircle,
    tile: 'bg-blue-100 text-blue-600',
  },
  {
    type: 'link',
    title: 'Tautan Belajar',
    description: 'Sumber belajar pilihan dari internet',
    icon: Link2,
    tile: 'bg-emerald-100 text-emerald-600',
  },
]

// Ilustrasi banner: ikon lucide besar dalam kotak berwarna (bukan gambar dari produk lain).
const HERO_ICONS = [
  { icon: Calculator, className: 'top-6 right-[38%] rotate-[-12deg] bg-orange-400' },
  { icon: FlaskConical, className: 'top-24 right-[27%] rotate-[8deg] bg-fuchsia-500' },
  { icon: Code2, className: 'top-5 right-[16%] rotate-[10deg] bg-slate-800' },
  { icon: Globe, className: 'bottom-5 right-[33%] rotate-[6deg] bg-sky-500' },
  { icon: Languages, className: 'bottom-8 right-[6%] rotate-[-8deg] bg-blue-600' },
  { icon: Atom, className: 'top-14 right-[4%] rotate-[-4deg] bg-violet-500' },
  { icon: Lightbulb, className: 'bottom-4 right-[19%] rotate-[-14deg] bg-amber-400' },
]

function Hero({ title, description, search, onSearch, onSubmit, total, note }) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-brand-600 text-white shadow-sm">
      {/* Hiasan latar */}
      <div
        className="absolute -top-24 -right-16 hidden size-80 rounded-full bg-amber-400/90 lg:block"
        aria-hidden="true"
      />
      <div
        className="absolute -right-10 -bottom-20 size-48 rounded-full bg-brand-500 lg:right-1/4 lg:size-64"
        aria-hidden="true"
      />
      <div className="absolute inset-y-0 right-0 hidden w-1/2 lg:block" aria-hidden="true">
        {HERO_ICONS.map(({ icon: Icon, className }, index) => (
          <span
            key={index}
            className={`absolute flex size-16 items-center justify-center rounded-2xl text-white shadow-lg ring-4 ring-white/30 ${className}`}
          >
            <Icon className="size-8" />
          </span>
        ))}
        <GraduationCap className="absolute top-1/2 right-[26%] size-24 -translate-y-1/2 text-white/25" />
      </div>

      <div className="relative px-5 py-7 sm:px-8 sm:py-9 lg:max-w-[58%]">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-brand-50 sm:text-base">{description}</p>
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
          className="mt-5 flex items-center gap-2 rounded-xl bg-white p-1.5 shadow-lg"
        >
          <Search className="ml-2 size-5 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Cari judul materi..."
            aria-label="Cari judul materi"
            className="min-w-0 flex-1 border-0 bg-transparent px-1 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:ring-0 focus:outline-none sm:text-sm"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-900"
          >
            Cari
          </button>
        </form>
        <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-brand-50">
          <li className="flex items-center gap-2">
            <GraduationCap className="size-4 text-amber-300" aria-hidden="true" />
            {note ?? (
              <span>
                Materi dari guru <strong className="text-white">{SCHOOL.name}</strong>
              </span>
            )}
          </li>
          <li className="flex items-center gap-2">
            <Sprout className="size-4 text-amber-300" aria-hidden="true" />
            <span>
              <strong className="text-white">{total} materi</strong> dan akan terus bertambah
            </span>
          </li>
        </ul>
      </div>
    </section>
  )
}

// Panel berwarna dengan kepala putih (judul + tombol di kanan).
function ExplorePanel({ title, tone, action, children }) {
  return (
    <section className={`rounded-2xl p-3 sm:p-4 ${tone}`}>
      <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3.5 shadow-sm sm:px-5">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function PanelButton({ onClick, children, pressed }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className="inline-flex shrink-0 items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
    >
      {children}
      <Grip className="size-4" aria-hidden="true" />
    </button>
  )
}

function SubjectTile({ assignment, label, sublabel, count, selected, onClick }) {
  const style = SUBJECT_STYLES[subjectIconKey(assignment.subject_name)]
  const Icon = style.icon
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group relative flex h-32 flex-col overflow-hidden rounded-xl bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${
        selected ? 'ring-2 ring-brand-600' : 'ring-1 ring-amber-200'
      }`}
    >
      <span className="pr-14 font-semibold text-slate-900">{label}</span>
      {sublabel && <span className="mt-0.5 pr-14 text-xs text-slate-500">{sublabel}</span>}
      <span
        className={`mt-auto w-max rounded-full px-2 py-0.5 text-xs font-medium ${
          selected ? 'bg-brand-600 text-white' : 'bg-amber-100 text-amber-900'
        }`}
      >
        {count} materi
      </span>
      {/* Ikon besar "mengintip" dari tepi kanan kartu */}
      <span
        aria-hidden="true"
        className={`absolute -right-3 bottom-4 flex size-16 rotate-6 items-center justify-center rounded-2xl text-white shadow-md transition group-hover:rotate-0 ${style.tile}`}
      >
        <Icon className="size-8" />
      </span>
    </button>
  )
}

function TypeRow({ card, count, selected, onClick }) {
  const Icon = card.icon
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group flex w-full items-center gap-4 rounded-xl bg-white p-4 text-left shadow-sm transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${
        selected ? 'ring-2 ring-brand-600' : 'ring-1 ring-sky-100'
      }`}
    >
      <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${card.tile}`}>
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-900">{card.title}</span>
        <span className="block text-sm text-slate-500">{card.description}</span>
      </span>
      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
        {count}
      </span>
      <ArrowRight
        className="size-5 shrink-0 text-orange-500 transition group-hover:translate-x-1"
        aria-hidden="true"
      />
    </button>
  )
}

const VISIBLE_SUBJECTS = 4

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
  const [showAll, setShowAll] = useState(false)
  const list = assignments ?? []
  const visible = showAll ? list : list.slice(0, VISIBLE_SUBJECTS)
  const set = (changes) => onChange({ ...filters, ...changes })

  return (
    <div className="space-y-6">
      <Hero
        title={title}
        description={description}
        note={note}
        total={total}
        search={filters.search}
        onSearch={(search) => set({ search })}
        onSubmit={onSearchSubmit}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ExplorePanel
          title="Pilihan Mata Pelajaran"
          tone="bg-amber-100"
          action={
            list.length > VISIBLE_SUBJECTS && (
              <PanelButton onClick={() => setShowAll((all) => !all)} pressed={showAll}>
                {showAll ? 'Lebih Sedikit' : 'Lihat Semua'}
              </PanelButton>
            )
          }
        >
          {list.length === 0 ? (
            <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-500">
              Belum ada mata pelajaran.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {visible.map((a) => {
                const selected = String(filters.assignment) === String(a.id)
                return (
                  <SubjectTile
                    key={a.id}
                    assignment={a}
                    label={assignmentLabel(a)}
                    sublabel={assignmentSublabel?.(a)}
                    count={subjectCounts[a.id] ?? 0}
                    selected={selected}
                    onClick={() => set({ assignment: selected ? '' : String(a.id) })}
                  />
                )
              })}
            </div>
          )}
        </ExplorePanel>

        <ExplorePanel
          title="Eksplorasi Tipe Materi"
          tone="bg-sky-100"
          action={
            <PanelButton onClick={() => set({ type: '' })} pressed={!filters.type}>
              Semua Tipe
            </PanelButton>
          }
        >
          <div className="space-y-3">
            {MATERIAL_TYPE_CARDS.map((card) => {
              const selected = filters.type === card.type
              return (
                <TypeRow
                  key={card.type}
                  card={card}
                  count={typeCounts[card.type] ?? 0}
                  selected={selected}
                  onClick={() => set({ type: selected ? '' : card.type })}
                />
              )
            })}
          </div>
        </ExplorePanel>
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
  const assignment = assignments?.find((a) => String(a.id) === String(filters.assignment))
  const type = MATERIAL_TYPE_CARDS.find((card) => card.type === filters.type)
  const chips = [
    assignment && { key: 'assignment', label: assignmentLabel(assignment) },
    type && { key: 'type', label: type.title },
    filters.search.trim() && { key: 'search', label: `“${filters.search.trim()}”` },
  ].filter(Boolean)
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <h2 className="mr-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
        <Layers className="size-5 text-brand-600" aria-hidden="true" />
        {chips.length ? 'Hasil Materi' : 'Semua Materi'}
        <span className="text-sm font-normal text-slate-500">({count})</span>
      </h2>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onChange({ ...filters, [chip.key]: '' })}
          className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-800 ring-1 ring-brand-200 hover:bg-brand-100"
          aria-label={`Hapus penyaring ${chip.label}`}
        >
          {chip.label}
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() => onChange({ search: '', assignment: '', type: '' })}
          className="text-sm text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
        >
          Hapus semua
        </button>
      )}
    </div>
  )
}
