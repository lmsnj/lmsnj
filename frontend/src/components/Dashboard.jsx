import { Link } from 'react-router-dom'
import Alert from './Alert'
import Spinner from './Spinner'

// Komponen bersama untuk dashboard ketiga peran.

// Judul bagian "Ringkasan" di bawah kartu Beranda (id dipakai tautan /admin#ringkasan).
export function SummaryHeading({ subtitle }) {
  return (
    <div id="ringkasan" className="mt-8 mb-4 scroll-mt-24">
      <h2 className="text-lg font-bold text-slate-900">Ringkasan</h2>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
  )
}

const TONES = {
  default: 'text-slate-900',
  brand: 'text-brand-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
}

export function StatCard({ label, value, hint, tone = 'default', to }) {
  const content = (
    <>
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${TONES[tone]}`}>{value ?? '-'}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  )
  const className = 'block rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200'
  if (!to) return <div className={className}>{content}</div>
  return (
    <Link to={to} className={`${className} transition hover:ring-brand-600`}>
      {content}
    </Link>
  )
}

export function StatGrid({ children }) {
  return <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
}

// Kotak berjudul berisi daftar. `empty` tampil jika `items` kosong.
export function Panel({ title, action, items, empty, children }) {
  return (
    <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      {items && items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100">{children}</ul>
      )}
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
        <Link to={to} className="block hover:bg-slate-50">
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
