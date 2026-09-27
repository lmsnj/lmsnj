import { ChevronRight, LayoutDashboard } from 'lucide-react'
import { Link } from 'react-router-dom'
import Alert from './Alert'
import Spinner from './Spinner'

// Komponen bersama untuk dashboard ketiga peran.

// Judul bagian "Ringkasan" di bawah kartu Beranda (id dipakai tautan /admin#ringkasan).
export function SummaryHeading({ subtitle }) {
  return (
    <div id="ringkasan" className="mt-10 mb-4 flex scroll-mt-24 items-center gap-3">
      <span className="flex size-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
        <LayoutDashboard className="size-5" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-xl font-bold text-slate-900">Ringkasan</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
    </div>
  )
}

// Warna angka & kotak ikon per nada.
const TONES = {
  default: { value: 'text-slate-900', tile: 'bg-slate-100 text-slate-600' },
  brand: { value: 'text-brand-700', tile: 'bg-brand-100 text-brand-700' },
  blue: { value: 'text-blue-700', tile: 'bg-blue-100 text-blue-600' },
  violet: { value: 'text-violet-700', tile: 'bg-violet-100 text-violet-700' },
  amber: { value: 'text-amber-700', tile: 'bg-amber-100 text-amber-700' },
  red: { value: 'text-red-700', tile: 'bg-red-100 text-red-600' },
}

/** Kartu angka. `icon` (opsional) tampil di kotak berwarna; `to` membuat kartu bisa diklik. */
export function StatCard({ label, value, hint, tone = 'default', to, icon: Icon }) {
  const colors = TONES[tone] ?? TONES.default
  const content = (
    <div className="flex items-start gap-3">
      {Icon && (
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${colors.tile}`}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
        <p className={`mt-0.5 text-3xl font-bold ${colors.value}`}>{value ?? '-'}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
      {to && (
        <ChevronRight
          className="size-5 shrink-0 self-center text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600"
          aria-hidden="true"
        />
      )}
    </div>
  )
  const className = 'group block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200'
  if (!to) return <div className={className}>{content}</div>
  return (
    <Link to={to} className={`${className} transition hover:shadow-md hover:ring-brand-300`}>
      {content}
    </Link>
  )
}

export function StatGrid({ children }) {
  return <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
}

/**
 * Kotak berjudul berisi daftar (gaya panel abu-abu muda dengan isi putih).
 * `icon` (opsional) di samping judul; `empty` tampil jika `items` kosong.
 */
export function Panel({ title, icon: Icon, action, items, empty, children }) {
  return (
    <section className="rounded-2xl bg-slate-50 p-2 ring-1 ring-slate-200/70">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          {Icon && <Icon className="size-5 text-brand-600" aria-hidden="true" />}
          {title}
        </h2>
        {action}
      </div>
      <div className="rounded-xl bg-white shadow-sm">
        {items && items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">{empty}</p>
        ) : (
          <ul className="divide-y divide-slate-100">{children}</ul>
        )}
      </div>
    </section>
  )
}

// Satu baris di Panel. Jika `to` diisi, baris bisa diklik.
export function PanelItem({ to, title, meta, aside }) {
  const content = (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{title}</p>
        {meta && <p className="truncate text-xs text-slate-500">{meta}</p>}
      </div>
      {aside && <div className="shrink-0 text-right text-sm">{aside}</div>}
    </div>
  )
  return (
    <li>
      {to ? (
        <Link to={to} className="block first:rounded-t-xl last:rounded-b-xl hover:bg-slate-50">
          {content}
        </Link>
      ) : (
        content
      )}
    </li>
  )
}

// Pembungkus state loading/error agar setiap dashboard cukup mengurus isinya.
export function DashboardState({ loading, error, children }) {
  if (error) return <Alert type="error">{error}</Alert>
  if (loading) {
    return (
      <div className="py-16 text-center text-brand-600">
        <Spinner className="size-8" />
      </div>
    )
  }
  return children
}
