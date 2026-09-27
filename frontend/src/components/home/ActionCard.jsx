import { Link } from 'react-router-dom'
import { SoonBadge } from '../Dropdown'
import Tooltip, { InfoTip } from '../Tooltip'

// Warna tombol aksi & ikon kartu. Tambahkan di sini jika butuh warna baru.
const COLORS = {
  orange: { button: 'bg-orange-500 hover:bg-orange-600', icon: 'bg-orange-50 text-orange-500' },
  green: { button: 'bg-brand-600 hover:bg-brand-700', icon: 'bg-brand-50 text-brand-600' },
  slate: { button: 'bg-slate-600 hover:bg-slate-700', icon: 'bg-slate-100 text-slate-600' },
  blue: { button: 'bg-blue-600 hover:bg-blue-700', icon: 'bg-blue-50 text-blue-600' },
}

/**
 * Tombol aksi: ikon + teks + ikon info (tooltip penjelasan).
 * Tanpa `to` / dengan `soon: true` -> tombol nonaktif bertooltip "Segera hadir".
 */
export function ActionButton({ action, color }) {
  const Icon = action.icon
  const inner = (
    <>
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="flex-1 text-left">{action.label}</span>
    </>
  )

  if (action.soon || !action.to) {
    return (
      <div className="flex items-center rounded-lg bg-slate-100 text-slate-400">
        <Tooltip text="Segera hadir" className="flex-1">
          <span
            aria-disabled="true"
            tabIndex={0}
            className="flex flex-1 cursor-not-allowed items-center gap-2 px-3 py-2.5 text-sm font-medium"
          >
            {inner}
            <SoonBadge />
          </span>
        </Tooltip>
        <InfoTip text={`Segera hadir. ${action.info}`} label={action.label} className="mr-1.5" />
      </div>
    )
  }

  return (
    <div
      className={`flex items-center rounded-lg text-white shadow-sm transition ${COLORS[color].button}`}
    >
      <Link
        to={action.to}
        className="flex flex-1 items-center gap-2 rounded-l-lg px-3 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        {inner}
      </Link>
      <span className="h-6 w-px bg-white/30" aria-hidden="true" />
      <InfoTip text={action.info} label={action.label} className="mx-1.5" />
    </div>
  )
}

// Kartu besar di Beranda: judul, ikon besar berwarna di pojok kanan atas, 2 tombol aksi.
export default function ActionCard({ card }) {
  const Icon = card.icon
  const color = COLORS[card.color]
  return (
    <section className="flex flex-col rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg leading-snug font-bold text-slate-900 sm:text-xl">{card.title}</h2>
          {card.description && <p className="mt-1 text-sm text-slate-500">{card.description}</p>}
        </div>
        <span
          className={`flex size-16 shrink-0 items-center justify-center rounded-2xl ${color.icon}`}
        >
          <Icon className="size-9" strokeWidth={1.75} aria-hidden="true" />
        </span>
      </div>
      <div className="mt-auto grid gap-2 sm:grid-cols-2">
        {card.actions.map((action) => (
          <ActionButton key={action.label} action={action} color={card.color} />
        ))}
      </div>
    </section>
  )
}
