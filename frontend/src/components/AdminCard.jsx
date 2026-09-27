import { Link } from 'react-router-dom'
import { STRIPES } from '../utils/constants'

/**
 * Kartu data untuk halaman admin (pengguna, kelas, mapel, pengampu).
 * - `icon`: elemen ikon/avatar di kiri atas
 * - `tone`: kelas latar kotak atas (mis. warna lembut mapel); kosong = putih
 * - `to`: jika diisi, judul menjadi tautan ke halaman detail
 * - `badges`: elemen label di kanan judul
 * - `meta`: [{ icon, content }] baris info di bawah judul
 * - `actions`: tombol di bagian bawah kartu
 */
export default function AdminCard({ icon, tone, title, subtitle, to, badges, meta = [], actions }) {
  return (
    <article className="flex flex-col rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md">
      <div className={`relative overflow-hidden rounded-xl p-4 ${tone ?? ''}`}>
        {tone && (
          <div className={`absolute inset-y-0 right-0 w-2/3 ${STRIPES}`} aria-hidden="true" />
        )}
        <div className="relative flex items-start gap-3">
          {icon}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              {to ? (
                <Link
                  to={to}
                  className="min-w-0 font-bold break-words text-slate-900 hover:text-brand-700 hover:underline"
                >
                  {title}
                </Link>
              ) : (
                <p className="min-w-0 font-bold break-words text-slate-900">{title}</p>
              )}
              {badges && <div className="flex flex-wrap gap-1">{badges}</div>}
            </div>
            {subtitle && <p className="mt-0.5 text-sm break-words text-slate-600">{subtitle}</p>}
          </div>
        </div>
      </div>
      {meta.filter(Boolean).length > 0 && (
        <ul className="space-y-1.5 px-3 pt-3 text-sm text-slate-600">
          {meta.filter(Boolean).map(({ icon: Icon, content }, index) => (
            <li key={index} className="flex items-center gap-2">
              <Icon className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="min-w-0 break-words">{content}</span>
            </li>
          ))}
        </ul>
      )}
      {actions && (
        <div className="mt-auto flex flex-wrap justify-end gap-1 border-t border-slate-100 px-1 pt-2">
          {actions}
        </div>
      )}
    </article>
  )
}

// Grid kartu admin: 1 kolom di HP, 2 di tablet, 3 di layar lebar.
export function CardGrid({ children }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
}
