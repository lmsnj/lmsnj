import { FileText, Link2, Lock, PlayCircle, Sparkles, Target } from 'lucide-react'
import { MATERIAL_TYPES } from '../utils/constants'
import { progressStatus } from '../utils/learningPath'
import { formatDate } from '../utils/media'
import Badge from './Badge'
import EmptyState from './EmptyState'
import Spinner from './Spinner'

// Ikon besar per tipe materi (sama warnanya dengan kartu "Eksplorasi Tipe Materi").
const TYPE_ICONS = {
  pdf: { icon: FileText, tile: 'bg-red-100 text-red-600' },
  video: { icon: PlayCircle, tile: 'bg-blue-100 text-blue-600' },
  link: { icon: Link2, tile: 'bg-emerald-100 text-emerald-600' },
  media: { icon: Sparkles, tile: 'bg-violet-100 text-violet-600' },
}

// Ringkasan syarat capaian satu materi (untuk guru), mis. "3 capaian · tugas · disahkan guru".
function requirementText(material) {
  const parts = []
  if (material.objectives?.length) parts.push(`${material.objectives.length} capaian`)
  if (material.required_task) parts.push('tugas')
  if (material.required_assessment) parts.push('asesmen')
  if (material.require_reflection) parts.push('refleksi')
  if (material.require_teacher_approval) parts.push('disahkan guru')
  return parts.join(' · ')
}

/**
 * Daftar materi. `actions(material)` opsional untuk tombol khusus guru.
 * `numbered` menampilkan "Materi 1, 2, ..." sesuai urutan daftar (satu kelas-mapel).
 * Untuk siswa, `material.progress` (dari API) menampilkan nomor, status capaian, dan kunci.
 * `showStatus` menampilkan label Draf/Terbit (hanya berguna untuk guru).
 * `showContext` menampilkan mapel & kelas (untuk daftar gabungan semua kelas).
 * `selection` = { isChecked(materi), onChange(materi, checked) } -> kotak centang di kiri (mode pilih guru).
 */
export default function MaterialList({
  materials,
  loading,
  onOpen,
  actions,
  showStatus,
  showContext,
  emptyTitle,
  emptyMessage,
  numbered,
  selection,
}) {
  if (loading && !materials?.length) {
    return (
      <div className="py-10 text-center text-brand-600">
        <Spinner />
      </div>
    )
  }
  if (!materials?.length) {
    return <EmptyState title={emptyTitle ?? 'Belum ada materi'}>{emptyMessage}</EmptyState>
  }

  return (
    <ul className="space-y-3">
      {materials.map((material, index) => {
        const type = MATERIAL_TYPES[material.material_type]
        const progress = material.progress
        const status = progressStatus(progress)
        const locked = Boolean(progress?.locked)
        const { icon: Icon, tile } = locked
          ? { icon: Lock, tile: 'bg-slate-100 text-slate-500' }
          : (TYPE_ICONS[material.material_type] ?? TYPE_ICONS.link)
        const number = progress?.order_number ?? (numbered ? index + 1 : null)
        const requirements = !progress && requirementText(material)
        const checked = Boolean(selection?.isChecked(material))
        return (
          <li
            key={material.id}
            // Tombol guru banyak; jika diletakkan di samping, kolom teks terjepit (satu huruf per baris).
            // Karena itu tombol aksi selalu di bawah teks. Mode pilih: kotak centang selalu di kiri.
            className={`flex gap-3 rounded-xl bg-white p-4 shadow-sm transition hover:shadow-md ${
              checked ? 'ring-2 ring-brand-600' : 'ring-1 ring-slate-200'
            } ${selection ? 'items-center' : actions ? 'flex-col' : 'flex-col sm:flex-row sm:items-center'}`}
          >
            {selection && (
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => selection.onChange(material, event.target.checked)}
                aria-label={`Pilih ${material.title}`}
                className="size-5 shrink-0 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-600"
              />
            )}
            <button
              type="button"
              onClick={() => onOpen(material)}
              className="group flex min-w-0 flex-1 items-start gap-4 text-left"
            >
              <span
                className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${tile}`}
              >
                <Icon className="size-6" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  {number && (
                    <span className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                      Materi {number}
                    </span>
                  )}
                  <Badge color={type.color}>{type.label}</Badge>
                  {status && <Badge color={status.color}>{status.label}</Badge>}
                  {showStatus && (
                    <Badge color={material.is_published ? 'green' : 'amber'}>
                      {material.is_published ? 'Terbit' : 'Draf'}
                    </Badge>
                  )}
                </span>
                <span
                  className={`mt-1 block font-medium group-hover:text-brand-700 ${
                    locked ? 'text-slate-500' : 'text-slate-900'
                  }`}
                >
                  {material.title}
                </span>
                {locked && progress.locked_by && (
                  <span className="mt-0.5 block text-sm text-slate-500">
                    Selesaikan dulu &ldquo;{progress.locked_by}&rdquo; untuk membuka.
                  </span>
                )}
                {requirements && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-sky-800">
                    <Target className="size-3.5" aria-hidden="true" /> Syarat lanjut: {requirements}
                  </span>
                )}
                {material.description && !locked && (
                  <span className="mt-0.5 line-clamp-2 block text-sm text-slate-600">
                    {material.description}
                  </span>
                )}
                <span className="mt-1 block text-xs text-slate-500">
                  {showContext && `${material.subject_name} · ${material.classroom_name} · `}
                  {formatDate(material.created_at)}
                  {/* Guru tim pengampu memakai materi bersama, jadi pengunggahnya perlu terlihat. */}
                  {showStatus && material.created_by_name && ` · oleh ${material.created_by_name}`}
                </span>
              </span>
            </button>
            {actions && (
              <div className="flex flex-wrap gap-1 border-t border-slate-100 pt-2 sm:justify-end">
                {actions(material)}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
