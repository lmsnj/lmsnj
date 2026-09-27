import { ArrowRight, Grip, Layers, X } from 'lucide-react'
import { useState } from 'react'
import { subjectStyle } from '../utils/subjectStyles'

/**
 * Panel penyaring bergaya halaman Materi: panel kuning "Pilihan Mata Pelajaran" dan panel biru
 * muda berisi pilihan (tipe/status). Kartu = tombol penyaring (klik lagi untuk membatalkan).
 */

// Panel berwarna dengan kepala putih (judul + tombol di kanan).
export function ExplorePanel({ title, tone, action, children }) {
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

export function PanelButton({ onClick, children, pressed }) {
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

function SubjectTile({ subject, label, sublabel, count, unit, selected, onClick }) {
  const style = subjectStyle(subject)
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
        {count} {unit}
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

const VISIBLE_SUBJECTS = 4

/**
 * Panel "Pilihan Mata Pelajaran": kartu setiap pengampu (mapel di kelas) + jumlah item.
 * Bisa juga untuk daftar lain (mis. kelas) asal tiap item punya `id` dan `subject_name`
 * (dipakai untuk menebak ikon).
 * `selected` = id pengampu terpilih ('' = semua), `onSelect(id | '')`.
 */
export function SubjectPanel({
  title = 'Pilihan Mata Pelajaran',
  emptyText = 'Belum ada mata pelajaran.',
  assignments,
  counts,
  unit,
  selected,
  onSelect,
  label = (a) => a.subject_name,
  sublabel,
}) {
  const [showAll, setShowAll] = useState(false)
  const list = assignments ?? []
  const visible = showAll ? list : list.slice(0, VISIBLE_SUBJECTS)
  return (
    <ExplorePanel
      title={title}
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
        <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((a) => {
            const isSelected = String(selected) === String(a.id)
            return (
              <SubjectTile
                key={a.id}
                subject={a.subject_name}
                label={label(a)}
                sublabel={sublabel?.(a)}
                count={counts[a.id] ?? 0}
                unit={unit}
                selected={isSelected}
                onClick={() => onSelect(isSelected ? '' : String(a.id))}
              />
            )
          })}
        </div>
      )}
    </ExplorePanel>
  )
}

function OptionRow({ option, count, selected, onClick }) {
  const Icon = option.icon
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group flex w-full items-center gap-4 rounded-xl bg-white p-4 text-left shadow-sm transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${
        selected ? 'ring-2 ring-brand-600' : 'ring-1 ring-sky-100'
      }`}
    >
      <span
        className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${option.tile}`}
      >
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-900">{option.title}</span>
        <span className="block text-sm text-slate-500">{option.description}</span>
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

/**
 * Panel biru muda berisi pilihan (mis. tipe materi atau status tugas).
 * `options`: [{ id, title, description, icon, tile }], `counts`: { id: jumlah }.
 */
export function OptionPanel({ title, options, counts, selected, onSelect, resetLabel }) {
  return (
    <ExplorePanel
      title={title}
      tone="bg-sky-100"
      action={
        <PanelButton onClick={() => onSelect('')} pressed={!selected}>
          {resetLabel}
        </PanelButton>
      }
    >
      <div className="space-y-3">
        {options.map((option) => {
          const isSelected = selected === option.id
          return (
            <OptionRow
              key={option.id}
              option={option}
              count={counts[option.id] ?? 0}
              selected={isSelected}
              onClick={() => onSelect(isSelected ? '' : option.id)}
            />
          )
        })}
      </div>
    </ExplorePanel>
  )
}

/**
 * Judul hasil + label penyaring aktif. `chips`: [{ key, label }] — klik = hapus penyaring itu
 * (`onRemove(key)`); "Hapus semua" memanggil `onClear()`.
 */
export function FilterChips({ count, chips, onRemove, onClear, className = 'mb-4' }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <h2 className="mr-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
        <Layers className="size-5 text-brand-600" aria-hidden="true" />
        {chips.length ? 'Hasil' : 'Semua'}
        <span className="text-sm font-normal text-slate-500">({count})</span>
      </h2>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onRemove(chip.key)}
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
          onClick={onClear}
          className="text-sm text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
        >
          Hapus semua
        </button>
      )}
    </div>
  )
}
