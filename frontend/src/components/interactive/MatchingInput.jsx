import { useState } from 'react'
import { connectPair, disconnectPair, PAIR_COLORS } from '../../utils/interactive'
import RichText from '../RichText'
import ReviewMark, { KeyHint } from './ReviewMark'

const itemClass =
  'flex min-h-12 w-full items-center gap-2 rounded-xl px-3 py-2 text-start leading-snug ring-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-default'

function PairNumber({ number, color }) {
  return (
    <span
      className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[0.8em] font-bold ring-2 ${
        number ? color : 'bg-white text-slate-300 ring-slate-200'
      }`}
      aria-hidden="true"
    >
      {number ?? '•'}
    </span>
  )
}

/**
 * Menjodohkan: klik pernyataan di kiri, lalu klik jawaban di kanan. Pasangan ditandai warna dan
 * nomor yang sama. Klik lagi pernyataan (atau jawaban) yang sudah berpasangan untuk membatalkan.
 * `review`: { result: { idKiri: benar/salah }, key: { pairs: { idKiri: idKanan } } | null, keyOnly }.
 */
export default function MatchingInput({ content, value, onChange, number, dir, review }) {
  const [active, setActive] = useState(null)
  const readOnly = !onChange
  const keyPairs = review?.key?.pairs
  const keyOnly = Boolean(review?.keyOnly && keyPairs)
  const pairs = keyOnly ? keyPairs : (value?.pairs ?? {})
  const rightById = new Map(content.right.map((item) => [item.id, item]))
  // Nomor pasangan = nomor urut pernyataan kiri.
  const numberOfLeft = new Map(content.left.map((item, index) => [item.id, index + 1]))
  const leftOfRight = new Map(Object.entries(pairs).map(([left, right]) => [right, left]))
  const colorOf = (n) => PAIR_COLORS[(n - 1) % PAIR_COLORS.length]
  const label = number ? `soal ${number}` : 'soal'

  const clickLeft = (id) => {
    if (active === id) {
      if (pairs[id]) onChange(disconnectPair(value, id))
      setActive(null)
    } else setActive(id)
  }
  const clickRight = (id) => {
    if (active) {
      onChange(connectPair(value, active, id))
      setActive(null)
    } else if (leftOfRight.has(id)) onChange(disconnectPair(value, leftOfRight.get(id)))
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:gap-6">
        <div role="group" aria-label={`Pernyataan ${label}`} className="space-y-2">
          {content.left.map((item) => {
            const n = numberOfLeft.get(item.id)
            const paired = Boolean(pairs[item.id])
            const correct = keyOnly ? true : review?.result?.[item.id]
            const keyRight =
              !keyOnly && correct === false ? rightById.get(keyPairs?.[item.id]) : null
            return (
              <div key={item.id}>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => clickLeft(item.id)}
                  aria-pressed={active === item.id}
                  aria-label={`${item.text}${paired ? `, berpasangan nomor ${n}` : ', belum berpasangan'}`}
                  className={`${itemClass} ${
                    active === item.id
                      ? 'bg-orange-50 ring-[3px] ring-orange-500'
                      : paired
                        ? colorOf(n)
                        : 'bg-white ring-slate-300 hover:ring-brand-600'
                  }`}
                >
                  <PairNumber number={paired ? n : null} color={colorOf(n)} />
                  <RichText text={item.text} dir={dir} as="span" className="min-w-0 flex-1" />
                  <ReviewMark correct={paired || correct === false ? correct : undefined} />
                </button>
                {keyRight && (
                  <p className="mt-1 ps-2">
                    <KeyHint>{keyRight.text}</KeyHint>
                  </p>
                )}
              </div>
            )
          })}
        </div>
        <div role="group" aria-label={`Jawaban ${label}`} className="space-y-2">
          {content.right.map((item) => {
            const left = leftOfRight.get(item.id)
            const n = left ? numberOfLeft.get(left) : null
            return (
              <button
                key={item.id}
                type="button"
                disabled={readOnly}
                onClick={() => clickRight(item.id)}
                aria-label={`${item.text}${n ? `, berpasangan nomor ${n}` : ''}`}
                className={`${itemClass} ${
                  n
                    ? colorOf(n)
                    : `bg-white ring-slate-300 ${active ? 'ring-2 ring-orange-300 hover:ring-orange-500' : 'hover:ring-brand-600'}`
                }`}
              >
                <PairNumber number={n} color={n ? colorOf(n) : ''} />
                <RichText text={item.text} dir={dir} as="span" className="min-w-0 flex-1" />
              </button>
            )
          })}
        </div>
      </div>
      {!readOnly && (
        <p className="text-[0.85em] text-slate-500" role="status">
          {active
            ? 'Sekarang klik jawaban yang cocok di kolom kanan.'
            : `${Object.keys(pairs).length} dari ${content.left.length} pasangan terhubung.`}
        </p>
      )}
    </div>
  )
}
