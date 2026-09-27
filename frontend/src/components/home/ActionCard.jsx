import { Link } from 'react-router-dom'
import { STRIPES } from '../../utils/constants'
import { SoonBadge } from '../Dropdown'
import Tooltip, { InfoTip } from '../Tooltip'

// Warna tombol aksi & ikon kartu. Tambahkan di sini jika butuh warna baru.
// `soft` = latar kotak judul, `tile` = kotak ikon besar.
const COLORS = {
  orange: { button: 'bg-orange-500 hover:bg-orange-600', soft: 'bg-orange-50', tile: 'bg-orange-500' },
  green: { button: 'bg-brand-600 hover:bg-brand-700', soft: 'bg-brand-50', tile: 'bg-brand-600' },
  slate: { button: 'bg-slate-600 hover:bg-slate-700', soft: 'bg-slate-100', tile: 'bg-slate-700' },
  blue: { button: 'bg-blue-600 hover:bg-blue-700', soft: 'bg-blue-50', tile: 'bg-blue-600' },
} // prettier-ignore

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

// Kartu besar di Beranda: kotak judul berwarna lembut dengan ikon besar yang "mengintip" dari
// pojok kanan, lalu 2 tombol aksi.
export default function ActionCard({ card }) {
  const Icon = card.icon
  const color = COLORS[card.color]
  return (
    <section className="group flex flex-col rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md">
      <div className={`relative min-h-28 overflow-hidden rounded-xl p-5 pr-28 ${color.soft}`}>
        <div className={`absolute inset-y-0 right-0 w-2/3 ${STRIPES}`} aria-hidden="true" />
        <h2 className="relative text-lg leading-snug font-bold text-slate-900 sm:text-xl">
          {card.title}
        </h2>
        {card.description && (
          <p className="relative mt-1 text-sm text-slate-600">{card.description}</p>
        )}
        <span
          aria-hidden="true"
          className={`absolute -right-2 -bottom-3 flex size-24 rotate-[-8deg] items-center justify-center rounded-3xl text-white shadow-lg transition group-hover:rotate-0 ${color.tile}`}
        >
          <Icon className="size-12" strokeWidth={1.75} />
        </span>
      </div>
      <div className="mt-auto grid gap-2 p-2.5 pt-3 sm:grid-cols-2">
        {card.actions.map((action) => (
          <ActionButton key={action.label} action={action} color={card.color} />
        ))}
      </div>
    </section>
  )
}
