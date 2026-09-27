import { FileText, Link2, PlayCircle } from 'lucide-react'
import { MATERIAL_TYPES } from '../utils/constants'
import { formatDate } from '../utils/media'
import Badge from './Badge'
import EmptyState from './EmptyState'
import Spinner from './Spinner'

// Ikon besar per tipe materi (sama warnanya dengan kartu "Eksplorasi Tipe Materi").
const TYPE_ICONS = {
  pdf: { icon: FileText, tile: 'bg-red-100 text-red-600' },
  video: { icon: PlayCircle, tile: 'bg-blue-100 text-blue-600' },
  link: { icon: Link2, tile: 'bg-emerald-100 text-emerald-600' },
}

/**
 * Daftar materi. `actions(material)` opsional untuk tombol khusus guru.
 * `showStatus` menampilkan label Draf/Terbit (hanya berguna untuk guru).
 * `showContext` menampilkan mapel & kelas (untuk daftar gabungan semua kelas).
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
      {materials.map((material) => {
        const type = MATERIAL_TYPES[material.material_type]
        const { icon: Icon, tile } = TYPE_ICONS[material.material_type] ?? TYPE_ICONS.link
        return (
          <li
            key={material.id}
            className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md sm:flex-row sm:items-center"
          >
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
                  <Badge color={type.color}>{type.label}</Badge>
                  {showStatus && (
                    <Badge color={material.is_published ? 'green' : 'amber'}>
                      {material.is_published ? 'Terbit' : 'Draf'}
                    </Badge>
                  )}
                </span>
                <span className="mt-1 block font-medium text-slate-900 group-hover:text-brand-700">
                  {material.title}
                </span>
                {material.description && (
                  <span className="mt-0.5 line-clamp-2 block text-sm text-slate-600">
                    {material.description}
                  </span>
                )}
                <span className="mt-1 block text-xs text-slate-500">
                  {showContext && `${material.subject_name} · ${material.classroom_name} · `}
                  {formatDate(material.created_at)}
                </span>
              </span>
            </button>
            {actions && (
              <div className="flex flex-wrap gap-1 sm:justify-end">{actions(material)}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
