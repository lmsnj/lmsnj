import { ArrowRight, Plus, Trash2 } from 'lucide-react'
import Button from '../../../components/Button'
import { inputClass } from '../../../components/TextField'

const MAX_PAIRS = 10
const MAX_DISTRACTORS = 10

// Rancangan soal menjodohkan: { pairs: [{ left, right }], distractors: [teks kanan tambahan] }.
export default function MatchingFields({ spec, onChange, dir }) {
  const pairs = spec.pairs ?? []
  const distractors = spec.distractors ?? []
  const setPair = (index, side, text) =>
    onChange({ ...spec, pairs: pairs.map((p, i) => (i === index ? { ...p, [side]: text } : p)) })
  const setDistractor = (index, text) =>
    onChange({ ...spec, distractors: distractors.map((d, i) => (i === index ? text : d)) })

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-sm font-medium text-slate-700">
          Pasangan benar — pernyataan (kiri) dan jawabannya (kanan)
        </p>
        <ol className="space-y-2">
          {pairs.map((pair, index) => (
            <li key={index} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-sm font-semibold text-slate-500">
                {index + 1}.
              </span>
              <div className="grid min-w-0 flex-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
                <input
                  value={pair.left}
                  dir={dir}
                  onChange={(event) => setPair(index, 'left', event.target.value)}
                  placeholder="Pernyataan"
                  maxLength={500}
                  aria-label={`Pernyataan ${index + 1}`}
                  className={`${inputClass} ring-slate-300`}
                  required
                />
                <ArrowRight
                  className="hidden size-4 text-slate-400 sm:block rtl:rotate-180"
                  aria-hidden="true"
                />
                <input
                  value={pair.right}
                  dir={dir}
                  onChange={(event) => setPair(index, 'right', event.target.value)}
                  placeholder="Jawaban"
                  maxLength={200}
                  aria-label={`Jawaban pasangan ${index + 1}`}
                  className={`${inputClass} ring-brand-300`}
                  required
                />
              </div>
              <button
                type="button"
                disabled={pairs.length <= 2}
                onClick={() => onChange({ ...spec, pairs: pairs.filter((_, i) => i !== index) })}
                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                aria-label={`Hapus pasangan ${index + 1}`}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
        {pairs.length < MAX_PAIRS && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => onChange({ ...spec, pairs: [...pairs, { left: '', right: '' }] })}
          >
            <Plus className="size-4" aria-hidden="true" /> Tambah pasangan
          </Button>
        )}
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-slate-700">
          Pengecoh di kolom kanan (opsional) — jawaban yang tidak punya pasangan
        </p>
        <ul className="space-y-2">
          {distractors.map((text, index) => (
            <li key={index} className="flex items-center gap-2">
              <input
                value={text}
                dir={dir}
                onChange={(event) => setDistractor(index, event.target.value)}
                placeholder="Pengecoh"
                maxLength={200}
                aria-label={`Pengecoh ${index + 1}`}
                className={`${inputClass} ring-slate-300`}
                required
              />
              <button
                type="button"
                onClick={() =>
                  onChange({ ...spec, distractors: distractors.filter((_, i) => i !== index) })
                }
                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                aria-label={`Hapus pengecoh ${index + 1}`}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {distractors.length < MAX_DISTRACTORS && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => onChange({ ...spec, distractors: [...distractors, ''] })}
          >
            <Plus className="size-4" aria-hidden="true" /> Tambah pengecoh
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Urutan kiri dan kanan diacak untuk setiap siswa. Teks boleh berisi rumus $...$.
      </p>
    </div>
  )
}
