import { ArrowDown, ArrowUp, Check, X } from 'lucide-react'
import { useState } from 'react'
import DragDropInput from '../../components/interactive/DragDropInput'
import FillBlankInput from '../../components/interactive/FillBlankInput'
import MatchingInput from '../../components/interactive/MatchingInput'
import { choiceLetter } from '../../utils/assessments'
import { Rich, StepImage } from './ExplainSteps'

/** Pertanyaan + gambar (sama untuk semua latihan). */
export function Question({ step, user }) {
  return (
    <div className="space-y-3">
      <StepImage src={step.image} />
      <Rich text={step.text} user={user} className="font-semibold" />
    </div>
  )
}

function tone({ selected, isKey, wrong }) {
  if (isKey) return 'border-brand-600 bg-brand-50'
  if (wrong) return 'border-red-400 bg-red-50'
  if (selected) return 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
  return 'border-slate-300 bg-white hover:border-slate-500'
}

export function ChoiceStep({ step, value, onChange, review, user }) {
  const keyId = review?.key?.choice
  return (
    <div className="space-y-3">
      <Question step={step} user={user} />
      <div role="radiogroup" aria-label="Pilihan jawaban" className="space-y-2">
        {step.choices.map((choice, index) => {
          const selected = value?.choice === choice.id
          const isKey = keyId === choice.id
          const wrong = selected && review && review.result === false
          return (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!onChange}
              onClick={() => onChange({ choice: choice.id })}
              className={`flex min-h-12 w-full items-start gap-3 rounded-xl border p-3 text-start transition disabled:cursor-default ${tone({ selected, isKey, wrong })}`}
            >
              <span
                className={`flex size-[1.8em] shrink-0 items-center justify-center rounded-full border-2 font-bold ${
                  wrong
                    ? 'border-red-500 bg-red-500 text-white'
                    : selected || isKey
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-slate-300'
                }`}
                aria-hidden="true"
              >
                {choiceLetter(index)}
              </span>
              <Rich
                text={choice.text}
                user={user}
                as="span"
                className="min-w-0 flex-1 pt-[0.1em]"
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TrueFalseStep({ step, value, onChange, review, user }) {
  const keyAnswer = review?.key?.answer
  return (
    <div className="space-y-3">
      <Question step={step} user={user} />
      <div role="radiogroup" aria-label="Benar atau salah" className="grid grid-cols-2 gap-3">
        {[
          [true, 'Benar', Check],
          [false, 'Salah', X],
        ].map(([answer, label, Icon]) => {
          const selected = value?.answer === answer
          const isKey = keyAnswer === answer
          const wrong = selected && review && review.result === false
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!onChange}
              onClick={() => onChange({ answer })}
              className={`flex min-h-16 items-center justify-center gap-2 rounded-xl border-2 text-[1.1em] font-bold transition disabled:cursor-default ${tone({ selected, isKey, wrong })}`}
            >
              <Icon className="size-5" aria-hidden="true" /> {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Urutkan: tombol naik/turun (mudah diketuk di HP dan dipakai dengan keyboard). */
export function OrderingStep({ step, value, onChange, review, user }) {
  const byId = new Map(step.items.map((item) => [item.id, item]))
  const keyOrder = review?.key?.order
  const order = keyOrder ? keyOrder : (value?.order ?? step.items.map((item) => item.id))
  const move = (index, delta) => {
    const next = [...order]
    const target = index + delta
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange({ order: next })
  }
  return (
    <div className="space-y-3">
      <Question
        step={{ ...step, text: step.text || 'Susun langkah berikut dengan urutan yang benar.' }}
        user={user}
      />
      <ol className="space-y-2">
        {order.map((id, index) => {
          const correct = Array.isArray(review?.result) ? review.result[index] : undefined
          return (
            <li
              key={id}
              className={`flex items-center gap-2 rounded-xl border bg-white p-2 ${
                correct === true
                  ? 'border-brand-500 bg-brand-50'
                  : correct === false
                    ? 'border-red-400 bg-red-50'
                    : 'border-slate-300'
              }`}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-700">
                {index + 1}
              </span>
              <Rich text={byId.get(id)?.text} user={user} as="span" className="min-w-0 flex-1" />
              {onChange && (
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Naikkan langkah ${index + 1}`}
                    className="flex size-11 items-center justify-center rounded-lg ring-1 ring-slate-300 disabled:opacity-30"
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === order.length - 1}
                    aria-label={`Turunkan langkah ${index + 1}`}
                    className="flex size-11 items-center justify-center rounded-lg ring-1 ring-slate-300 disabled:opacity-30"
                  >
                    <ArrowDown className="size-4" aria-hidden="true" />
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

const BIN_TONES = [
  'bg-emerald-50 text-emerald-800 ring-emerald-300',
  'bg-rose-50 text-rose-800 ring-rose-300',
  'bg-sky-50 text-sky-800 ring-sky-300',
  'bg-amber-50 text-amber-800 ring-amber-300',
]

/** Kelompokkan: setiap butir diberi wadah dengan mengetuk tombol wadahnya. */
export function CategorizeStep({ step, value, onChange, review, user }) {
  const chosen = value?.items ?? {}
  const keyItems = review?.key?.items ?? null
  const set = (itemId, categoryId) => onChange({ items: { ...chosen, [itemId]: categoryId } })
  return (
    <div className="space-y-3">
      <Question
        step={{ ...step, text: step.text || 'Masukkan setiap butir ke wadah yang tepat.' }}
        user={user}
      />
      <ul className="space-y-2">
        {step.items.map((item) => {
          const correct = review?.result?.[item.id]
          const current = keyItems?.[item.id] ?? chosen[item.id]
          return (
            <li
              key={item.id}
              className={`space-y-2 rounded-xl border bg-white p-3 ${
                correct === true
                  ? 'border-brand-500'
                  : correct === false
                    ? 'border-red-400 bg-red-50'
                    : 'border-slate-300'
              }`}
            >
              <Rich text={item.text} user={user} />
              <div
                className="flex flex-wrap gap-2"
                role="radiogroup"
                aria-label={`Wadah untuk ${item.text}`}
              >
                {step.categories.map((category, index) => {
                  const selected = current === category.id
                  return (
                    <button
                      key={category.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={!onChange}
                      onClick={() => set(item.id, category.id)}
                      className={`min-h-11 rounded-lg px-3 text-[0.9em] font-semibold ring-1 transition disabled:cursor-default ${
                        selected
                          ? `${BIN_TONES[index % BIN_TONES.length]} ring-2`
                          : 'bg-white text-slate-600 ring-slate-300'
                      }`}
                    >
                      {category.label}
                    </button>
                  )
                })}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Ketuk bagian gambar. Koordinat bagian dalam persen agar tetap pas di layar mana pun. */
export function HotspotStep({ step, value, onChange, review, user }) {
  const keyAreas = review?.key?.areas ?? []
  // 'loading' | 'ok' | 'error'. Bagian langsung bisa diketuk walau gambar masih/gagal dimuat.
  const [status, setStatus] = useState('loading')
  const hasImage = /^https?:\/\//.test(step.image || '')
  const imageShown = hasImage && status !== 'error'
  return (
    <div className="space-y-3">
      <Rich text={step.text} user={user} className="font-semibold" />
      <div
        className={`relative mx-auto w-full max-w-2xl ${status === 'ok' ? '' : 'aspect-video rounded-xl bg-slate-100'}`}
      >
        {imageShown && (
          <img
            src={step.image}
            alt=""
            onLoad={() => setStatus('ok')}
            onError={() => setStatus('error')}
            className={
              status === 'ok'
                ? 'block w-full rounded-xl'
                : 'absolute inset-0 size-full object-contain'
            }
          />
        )}
        {hasImage && status === 'error' && (
          <p className="absolute inset-x-0 bottom-2 text-center text-[0.8em] text-slate-500">
            Gambar gagal dimuat. Bagian tetap bisa diketuk.
          </p>
        )}
        {step.areas.map((area, index) => {
          const selected = value?.area === area.id
          const isKey = keyAreas.includes(area.id)
          const wrong = selected && review?.result === false
          return (
            <button
              key={area.id}
              type="button"
              disabled={!onChange}
              onClick={() => onChange({ area: area.id })}
              aria-pressed={selected}
              aria-label={area.label || `Bagian ${index + 1}`}
              style={{
                left: `${area.x}%`,
                top: `${area.y}%`,
                width: `${area.w}%`,
                height: `${area.h}%`,
              }}
              className={`absolute flex min-h-8 min-w-8 items-center justify-center rounded-lg border-2 text-[0.75em] font-bold transition ${
                isKey
                  ? 'border-brand-600 bg-brand-500/30'
                  : wrong
                    ? 'border-red-500 bg-red-500/30'
                    : selected
                      ? 'border-brand-600 bg-brand-500/20'
                      : 'border-dashed border-slate-500/70 bg-white/30 hover:bg-white/60'
              }`}
            >
              {area.label && (
                <span className="rounded bg-white/90 px-1 text-slate-800">{area.label}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const INTERACTIVE = {
  fill_blank: FillBlankInput,
  drag_drop: DragDropInput,
  matching: MatchingInput,
}

/** Isian rumpang, tarik & lepas, pasangkan: komponen yang sama dengan Asesmen. */
export function InteractiveStep({ step, value, onChange, review, user }) {
  const Input = INTERACTIVE[step.kind]
  return (
    <div className="space-y-3">
      <Question step={step} user={user} />
      <Input
        content={step}
        value={value}
        onChange={onChange}
        review={review ? { result: review.result, key: review.key ?? null } : undefined}
      />
    </div>
  )
}
