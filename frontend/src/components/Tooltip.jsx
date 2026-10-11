import { Info } from 'lucide-react'
import { useId } from 'react'

/**
 * Tooltip yang muncul saat kursor di atas elemen ATAU elemen di dalamnya difokus
 * (sehingga bisa dipakai lewat keyboard dan ketuk di HP).
 * Saat tersembunyi memakai `hidden` (bukan transparan): tooltip transparan di kartu paling kanan
 * tetap menonjol keluar layar dan membuat halaman bisa digeser ke samping.
 */
export default function Tooltip({ text, children, className = '' }) {
  const id = useId()
  return (
    <span className={`group/tip relative inline-flex ${className}`} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full hidden left-1/2 z-30 mb-2 w-max max-w-60 -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-center text-xs leading-snug font-normal text-white shadow-lg group-focus-within/tip:block group-hover/tip:block"
      >
        {text}
      </span>
    </span>
  )
}

// Ikon (i) kecil dengan penjelasan.
export function InfoTip({ text, label, className = '' }) {
  return (
    <Tooltip text={text} className={className}>
      <button
        type="button"
        aria-label={`Penjelasan: ${label}`}
        className="flex items-center rounded-md p-1 opacity-80 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-white"
      >
        <Info className="size-4" aria-hidden="true" />
      </button>
    </Tooltip>
  )
}
