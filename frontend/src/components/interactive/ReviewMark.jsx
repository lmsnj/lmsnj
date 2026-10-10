import { Check, X } from 'lucide-react'

// Tanda benar/salah kecil untuk satu celah/pasangan di halaman hasil.
export default function ReviewMark({ correct }) {
  if (correct === undefined || correct === null) return null
  return correct ? (
    <Check className="inline size-[1em] shrink-0 text-brand-700" aria-label="benar" />
  ) : (
    <X className="inline size-[1em] shrink-0 text-red-600" aria-label="salah" />
  )
}

// Kunci yang ditampilkan di samping jawaban yang salah.
export function KeyHint({ children }) {
  return (
    <span className="mx-1 inline-flex rounded bg-brand-100 px-1.5 text-[0.85em] leading-normal font-medium text-brand-800">
      Kunci: {children}
    </span>
  )
}
