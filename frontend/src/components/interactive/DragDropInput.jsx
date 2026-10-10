import { useState } from 'react'
import { clearGap, placeOption, resultTone } from '../../utils/interactive'
import AuthImage from '../AuthImage'
import RichText from '../RichText'
import GapSentence from './GapSentence'
import ReviewMark, { KeyHint } from './ReviewMark'

// Isi satu pilihan: gambar (jika ada) + teks.
function OptionContent({ option, dir }) {
  return (
    <span className="inline-flex flex-col items-center gap-1 align-middle">
      {option.image?.url && (
        <AuthImage
          url={option.image.url}
          alt={option.text || 'Gambar pilihan'}
          className="max-h-20 max-w-32"
        />
      )}
      {option.image?.name && (
        <span className="rounded bg-sky-50 px-1.5 text-xs text-sky-800">🖼 {option.image.name}</span>
      )}
      {option.text && <RichText text={option.text} dir={dir} as="span" />}
    </span>
  )
}

const chipClass =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-3 py-1 leading-normal font-medium ring-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900'

/**
 * Tarik & lepas: pilihan diseret ke celah dalam kalimat. Di HP (atau dengan keyboard): ketuk
 * pilihan, lalu ketuk celah. Ketuk celah yang terisi untuk mengosongkannya.
 * `review`: { result: [benar/salah per celah], key: { gaps: [id pilihan] } | null, keyOnly }.
 */
export default function DragDropInput({ content, value, onChange, number, dir, review }) {
  const [selected, setSelected] = useState(null)
  const count = content.parts.length - 1
  const readOnly = !onChange
  const byId = new Map(content.options.map((option) => [option.id, option]))
  const keyGaps = review?.key?.gaps
  const keyOnly = Boolean(review?.keyOnly && keyGaps)
  const gaps = Array.from({ length: count }, (_, i) =>
    keyOnly ? keyGaps[i] : (value?.gaps?.[i] ?? null),
  )
  const bank = content.options.filter((option) => !gaps.includes(option.id))
  const label = number ? `soal ${number}` : 'soal'

  const place = (gap, id) => {
    onChange(placeOption(value, count, gap, id))
    setSelected(null)
  }
  const tapGap = (gap) => {
    if (readOnly) return
    if (selected) place(gap, selected)
    else if (gaps[gap]) onChange(clearGap(value, count, gap))
  }
  const tapOption = (id) => !readOnly && setSelected((current) => (current === id ? null : id))
  const removeOption = (id) => {
    const gap = gaps.indexOf(id)
    if (gap >= 0) onChange(clearGap(value, count, gap))
  }

  const dragProps = (id) =>
    readOnly
      ? {}
      : {
          draggable: true,
          onDragStart: (event) => {
            event.dataTransfer.setData('text/plain', id)
            event.dataTransfer.effectAllowed = 'move'
            setSelected(null)
          },
        }
  const dropProps = (onDrop) =>
    readOnly
      ? {}
      : {
          onDragOver: (event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
          },
          onDrop: (event) => {
            event.preventDefault()
            const id = event.dataTransfer.getData('text/plain')
            if (byId.has(id)) onDrop(id)
          },
        }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-slate-300 sm:px-5">
        <GapSentence
          parts={content.parts}
          dir={dir}
          renderGap={(index) => {
            const option = byId.get(gaps[index])
            const correct = keyOnly ? true : review?.result?.[index]
            const keyOption = !keyOnly && correct === false ? byId.get(keyGaps?.[index]) : null
            return (
              <span key={index} className="mx-1 inline-flex items-center gap-1 align-middle">
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => tapGap(index)}
                  {...dropProps((id) => place(index, id))}
                  {...(option ? dragProps(option.id) : {})}
                  aria-label={`Tempat kosong ${index + 1} ${label}: ${
                    option ? `berisi ${option.text || 'gambar'}` : 'kosong'
                  }${selected ? ', ketuk untuk menaruh pilihan' : ''}`}
                  className={`${chipClass} min-w-[6em] disabled:cursor-default ${
                    option
                      ? resultTone(correct)
                      : `border-2 border-dashed ring-0 ${
                          selected
                            ? 'border-orange-500 bg-orange-50'
                            : correct === false
                              ? 'border-red-400 bg-red-50'
                              : 'border-slate-400 bg-slate-50'
                        }`
                  }`}
                >
                  {option ? <OptionContent option={option} dir={dir} /> : ' '}
                </button>
                <ReviewMark correct={correct} />
                {keyOption && (
                  <KeyHint>
                    <OptionContent option={keyOption} dir={dir} />
                  </KeyHint>
                )}
              </span>
            )
          }}
        />
      </div>

      <div
        {...dropProps(removeOption)}
        className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"
        aria-label={`Pilihan jawaban ${label}`}
        role="group"
      >
        <p className="mb-2 text-[0.8em] font-semibold tracking-wide text-slate-500 uppercase">
          {readOnly ? 'Pilihan yang tidak dipakai' : 'Pilihan jawaban'}
        </p>
        {bank.length === 0 ? (
          <p className="text-[0.85em] text-slate-500">
            {readOnly ? '-' : 'Semua pilihan sudah dipakai.'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {bank.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={readOnly}
                onClick={() => tapOption(option.id)}
                {...dragProps(option.id)}
                aria-pressed={selected === option.id}
                className={`${chipClass} bg-white disabled:cursor-default disabled:opacity-70 ${
                  selected === option.id
                    ? 'ring-[3px] ring-orange-500'
                    : 'cursor-grab ring-slate-300 hover:ring-brand-600'
                }`}
              >
                <OptionContent option={option} dir={dir} />
              </button>
            ))}
          </div>
        )}
        {selected && (
          <p className="mt-2 text-[0.85em] text-orange-700" role="status">
            Pilihan dipilih — ketuk tempat kosong di kalimat untuk menaruhnya.
          </p>
        )}
      </div>
    </div>
  )
}
