import { resultTone, setGap } from '../../utils/interactive'
import GapSentence from './GapSentence'
import ReviewMark, { KeyHint } from './ReviewMark'

/**
 * Isian singkat: kotak isian langsung di dalam kalimat.
 * `review` (halaman hasil): { result: [benar/salah per celah], key: { gaps: [[alternatif]] } | null }.
 */
export default function FillBlankInput({ content, value, onChange, number, dir, review }) {
  const count = content.parts.length - 1
  const readOnly = !onChange
  return (
    <div className="space-y-2">
      <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-slate-300 sm:px-5">
        <GapSentence
          parts={content.parts}
          dir={dir}
          renderGap={(index) => {
            const key = review?.key?.gaps?.[index]
            // Tanpa jawaban siswa (editor guru): kotak diisi kuncinya.
            const keyOnly = review?.keyOnly && key
            const text = keyOnly ? key.join(' / ') : (value?.gaps?.[index] ?? '')
            const correct = keyOnly ? true : review?.result?.[index]
            return (
              <span key={index} className="inline-flex items-center gap-1 align-baseline">
                <input
                  value={text}
                  readOnly={readOnly}
                  onChange={(event) => onChange(setGap(value, count, index, event.target.value))}
                  aria-label={number ? `Soal ${number} isian ${index + 1}` : `Isian ${index + 1}`}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={200}
                  style={{ width: `${Math.max(7, text.length + 2)}ch` }}
                  className={`mx-1 max-w-full rounded-md border-0 px-2 py-0.5 text-center text-[max(1em,16px)] leading-normal ring-1 ring-inset select-text focus:ring-2 focus:ring-brand-600 ${resultTone(correct)}`}
                />
                <ReviewMark correct={correct} />
                {key && !keyOnly && correct === false && <KeyHint>{key.join(' / ')}</KeyHint>}
              </span>
            )
          }}
        />
      </div>
      {content.case_sensitive && !review && (
        <p className="text-[0.85em] text-slate-500">Huruf besar dan kecil diperhatikan.</p>
      )}
    </div>
  )
}
