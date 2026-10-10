import { Brackets } from 'lucide-react'
import { useRef } from 'react'
import Button from '../../../components/Button'
import TextAreaField from '../../../components/TextAreaField'
import { parseGaps } from '../../../utils/interactive'

/**
 * Kotak kalimat soal dengan jawaban di dalam [[...]] (isian singkat & tarik-lepas), tombol
 * "Jadikan celah" untuk teks yang diblok, dan daftar celah yang dikenali.
 */
export default function GapTemplateField({ value, onChange, error, dir, alternatives, label }) {
  const field = useRef(null)
  const { gaps } = parseGaps(value)

  // Bungkus teks yang diblok dengan [[ ]] (atau sisipkan [[jawaban]] di posisi kursor).
  const makeGap = () => {
    const el = field.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const selected = value.slice(start, end).trim() || 'jawaban'
    onChange(`${value.slice(0, start)}[[${selected}]]${value.slice(end)}`)
  }

  return (
    <div className="space-y-2">
      <TextAreaField
        ref={field}
        label={label ?? 'Kalimat soal'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        error={error}
        dir={dir}
        rows={3}
        required
        hint={
          alternatives
            ? 'Tulis jawaban di dalam [[...]]. Jawaban lain yang juga benar dipisah tanda |, mis. [[HyperText|Hypertext]].'
            : 'Tulis jawaban di dalam [[...]], mis. Ibu kota Indonesia adalah [[Jakarta]] di pulau [[Jawa]].'
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={makeGap}>
          <Brackets className="size-4" aria-hidden="true" /> Jadikan celah
        </Button>
        {gaps.length > 0 && (
          <ol className="flex flex-wrap gap-1.5 text-xs">
            {gaps.map((alts, index) => (
              <li
                key={index}
                className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-800 ring-1 ring-brand-200"
              >
                {index + 1}. {alts.join(' / ') || '(kosong)'}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
