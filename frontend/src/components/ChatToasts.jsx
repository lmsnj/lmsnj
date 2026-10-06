import { MessageCircle, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { previewText } from '../utils/chatNotices'

/**
 * Pemberitahuan melayang "Pesan baru dari ..." di pojok kanan bawah (di HP: bawah layar).
 * Klik = buka percakapan itu di Ruang Obrolan. `aria-live` agar dibacakan pembaca layar.
 */
export default function ChatToasts({ toasts, onDismiss }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="pointer-events-auto flex w-full items-start gap-3 rounded-xl bg-white p-3 shadow-lg ring-1 ring-slate-200 sm:w-80"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
            <MessageCircle className="size-5" aria-hidden="true" />
          </span>
          <Link
            to={`/obrolan?c=${toast.id}`}
            onClick={() => onDismiss(toast.id)}
            className="min-w-0 flex-1 rounded-lg focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            <p className="text-sm font-semibold text-slate-900">
              Pesan baru dari {toast.other.full_name}
            </p>
            <p className="truncate text-sm text-slate-600">{previewText(toast.last_message)}</p>
            <p className="mt-0.5 text-xs font-medium text-brand-700">
              {toast.unread > 1 ? `${toast.unread} pesan belum dibaca · ` : ''}Buka obrolan →
            </p>
          </Link>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Tutup pemberitahuan"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}
