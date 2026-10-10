import { Plus, Trash2 } from 'lucide-react'
import Button from '../../../components/Button'
import { inputClass } from '../../../components/TextField'
import { parseGaps } from '../../../utils/interactive'
import GapTemplateField from './GapTemplateField'

const MAX_DISTRACTORS = 10

/**
 * Rancangan soal tarik & lepas: { template, distractors }. Pilihan jawaban = isi setiap [[...]]
 * (urutan celah) lalu pengecoh; gambar pilihan mengikuti urutan itu.
 */
export default function DragDropFields({ spec, onChange, error, dir, imagePicker, hasImage }) {
  const gaps = parseGaps(spec.template ?? '').gaps
  const distractors = spec.distractors ?? []
  const setDistractor = (index, text) =>
    onChange({ ...spec, distractors: distractors.map((d, i) => (i === index ? text : d)) })

  return (
    <div className="space-y-4">
      <GapTemplateField
        value={spec.template ?? ''}
        onChange={(template) => onChange({ ...spec, template })}
        error={error}
        dir={dir}
      />

      {gaps.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium text-slate-700">
            Pilihan jawaban benar (otomatis dari [[...]]) — boleh diberi gambar
          </p>
          <ul className="space-y-2">
            {gaps.map((alternatives, index) => (
              <li key={index} className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800 ring-1 ring-brand-200">
                  {index + 1}. {alternatives[0] || '(kosong)'}
                </span>
                {imagePicker(`choice-${index}`, `Gambar jawaban ${index + 1}`)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-1 text-sm font-medium text-slate-700">Pilihan pengecoh (opsional)</p>
        <ul className="space-y-2">
          {distractors.map((text, index) => {
            const key = `choice-${gaps.length + index}`
            return (
              <li key={index} className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    value={text}
                    dir={dir}
                    onChange={(event) => setDistractor(index, event.target.value)}
                    placeholder={hasImage(key) ? '(boleh kosong: pengecoh bergambar)' : 'Pengecoh'}
                    maxLength={200}
                    aria-label={`Pengecoh ${index + 1}`}
                    className={`${inputClass} ring-slate-300`}
                  />
                  {index === distractors.length - 1 && (
                    <button
                      type="button"
                      onClick={() => onChange({ ...spec, distractors: distractors.slice(0, -1) })}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Hapus pengecoh ${index + 1}`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
                {imagePicker(key, `Gambar pengecoh ${index + 1}`)}
              </li>
            )
          })}
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
        Urutan pilihan diacak untuk setiap siswa. Gambar terikat pada nomor pilihan: jika jumlah
        [[...]] diubah setelah memberi gambar pengecoh, periksa lagi gambarnya di pratinjau.
      </p>
    </div>
  )
}
