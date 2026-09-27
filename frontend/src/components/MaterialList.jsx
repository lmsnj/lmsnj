import { MATERIAL_TYPES } from '../utils/constants'
import { formatDate } from '../utils/media'
import Badge from './Badge'
import EmptyState from './EmptyState'
import Spinner from './Spinner'

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
}) {
  if (loading && !materials?.length) {
    return (
      <div className="py-10 text-center text-brand-600">
        <Spinner />
      </div>
    )
  }
  if (!materials?.length) return <EmptyState title={emptyTitle ?? 'Belum ada materi'} />

  return (
    <ul className="space-y-3">
      {materials.map((material) => {
        const type = MATERIAL_TYPES[material.material_type]
        return (
          <li
            key={material.id}
            className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-center"
          >
            <button
              type="button"
              onClick={() => onOpen(material)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={type.color}>{type.label}</Badge>
                {showStatus && (
                  <Badge color={material.is_published ? 'green' : 'amber'}>
                    {material.is_published ? 'Terbit' : 'Draf'}
                  </Badge>
                )}
              </div>
              <p className="mt-1 font-medium text-slate-900 hover:text-brand-700">
                {material.title}
              </p>
              {material.description && (
                <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{material.description}</p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {showContext && `${material.subject_name} · ${material.classroom_name} · `}
                {formatDate(material.created_at)}
              </p>
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
