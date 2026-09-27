import { Pin } from 'lucide-react'
import { ROLE_LABELS } from '../utils/constants'
import { formatDate } from '../utils/media'
import Badge from './Badge'

// Satu pengumuman. `compact` = versi ringkas (isi dipotong) untuk panel Beranda.
export default function AnnouncementCard({ announcement: a, actions, compact }) {
  return (
    <article
      className={`rounded-xl bg-white p-4 ring-1 ${
        a.is_pinned ? 'ring-amber-300' : 'ring-slate-200'
      } ${compact ? '' : 'shadow-sm sm:p-5'}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {a.is_pinned && (
          <Badge color="amber">
            <Pin className="mr-1 inline size-3" aria-hidden="true" />
            Disematkan
          </Badge>
        )}
        <Badge color={a.teaching_assignment ? 'blue' : 'green'}>{a.target_label}</Badge>
      </div>
      <h3 className="mt-2 font-semibold text-slate-900">{a.title}</h3>
      <p
        className={`mt-1 text-sm whitespace-pre-line text-slate-700 ${compact ? 'line-clamp-2' : ''}`}
      >
        {a.body}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {a.author_name ?? 'Admin'}
          {a.author_role && ` (${ROLE_LABELS[a.author_role]})`} · {formatDate(a.created_at)}
        </p>
        {actions && <div className="flex flex-wrap gap-1">{actions}</div>}
      </div>
    </article>
  )
}
