import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CircleCheck,
  CircleX,
  Eye,
  Lightbulb,
  Map as MapIcon,
  RotateCcw,
  Sparkles,
  Star,
  Target,
  Trophy,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Alert from '../components/Alert'
import Button from '../components/Button'
import { getErrorMessage } from '../utils/errors'
import {
  canAdvance,
  initialValue,
  isNetworkError,
  localStepState,
  newUid,
  personalize,
  speakableText,
  startIndex,
  stationProgress,
  stepLabel,
  visibleHints,
} from './engine'
import { send } from './offlineQueue'
import { answered, stepDefinition } from './registry'
import { canSpeak, speak, stopSpeaking } from './speech'
import { Rich } from './steps/ExplainSteps'

const LIST_TITLES = { remedial: 'Belajar ulang', challenge: 'Tantangan' }
const MAX_VISIT = 30 * 60

export function Stars({ value, size = 'size-5', label = true }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={label ? `${value} dari 3 bintang` : undefined}
    >
      {[1, 2, 3].map((n) => (
        <Star
          key={n}
          className={`${size} ${n <= value ? 'fill-amber-400 text-amber-500' : 'text-slate-300'}`}
          aria-hidden="true"
        />
      ))}
    </span>
  )
}

function SpeakButton({ text }) {
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => stopSpeaking, [])
  if (!canSpeak()) return null
  const toggle = () => {
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
    } else {
      setSpeaking(true)
      speak(text, { onEnd: () => setSpeaking(false) })
    }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={speaking}
      className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[0.85em] font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
    >
      {speaking ? (
        <VolumeX className="size-4" aria-hidden="true" />
      ) : (
        <Volume2 className="size-4" aria-hidden="true" />
      )}
      {speaking ? 'Berhenti' : 'Bacakan'}
    </button>
  )
}

function ResultPanel({ result, onRetry, user }) {
  if (result.revealed) {
    return (
      <div className="rounded-xl bg-sky-50 p-4 ring-1 ring-sky-200" role="status">
        <p className="font-bold text-sky-800">Ini jawaban yang benar.</p>
        <Rich text={result.explanation} user={user} className="mt-1 text-[0.95em]" />
      </div>
    )
  }
  if (result.correct) {
    return (
      <div className="rounded-xl bg-brand-50 p-4 ring-1 ring-brand-200" role="status">
        <p className="flex items-center gap-2 font-bold text-brand-800">
          <CircleCheck className="size-5" aria-hidden="true" /> Benar! Hebat.
        </p>
        <Rich text={result.explanation} user={user} className="mt-1 text-[0.95em]" />
      </div>
    )
  }
  return (
    <div className="space-y-2 rounded-xl bg-red-50 p-4 ring-1 ring-red-200" role="status">
      <p className="flex items-center gap-2 font-bold text-red-800">
        <CircleX className="size-5" aria-hidden="true" /> Belum tepat. Tidak apa-apa, coba lagi!
      </p>
      {result.feedback?.map((text, index) => (
        <Rich key={index} text={text} user={user} className="text-[0.95em] text-red-900" />
      ))}
      <Button variant="secondary" onClick={onRetry}>
        <RotateCcw className="size-4" aria-hidden="true" /> Coba lagi
      </Button>
    </div>
  )
}

function Summary({
  station,
  finish,
  reflection,
  onReflect,
  onList,
  onMap,
  onNext,
  readOnly,
  user,
}) {
  const [text, setText] = useState(reflection ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      await onReflect(text)
      setMessage(
        readOnly ? 'Pratinjau: refleksi tidak disimpan.' : 'Refleksi tersimpan. Terima kasih!',
      )
    } catch (error) {
      setMessage(
        isNetworkError(error)
          ? 'Sinyal putus. Refleksi akan dikirim otomatis saat online.'
          : getErrorMessage(error),
      )
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-brand-50 p-5 text-center ring-1 ring-brand-200">
        <Trophy className="mx-auto size-12 text-amber-500" aria-hidden="true" />
        <p className="mt-2 text-[1.2em] font-bold text-brand-900">Stasiun selesai!</p>
        <div className="mt-2 flex justify-center">
          <Stars value={finish.stars} size="size-8" />
        </div>
        {finish.best_stars > finish.stars && (
          <p className="mt-1 text-[0.85em] text-slate-600">
            Bintang terbaikmu tetap {finish.best_stars}.
          </p>
        )}
        {finish.badges?.map((badge) => (
          <p
            key={badge.code}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800"
          >
            <Sparkles className="size-4" aria-hidden="true" /> Lencana baru: {badge.title}
          </p>
        ))}
        {readOnly && (
          <p className="mt-2 text-[0.85em] text-slate-500">Pratinjau: hasil tidak disimpan.</p>
        )}
      </div>

      {finish.suggestion === 'remedial' && (
        <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="font-semibold text-amber-900">
            Masih ada yang membingungkan? Coba penjelasan lain dulu.
          </p>
          <Button className="mt-2" onClick={() => onList('remedial')}>
            <BookOpen className="size-4" aria-hidden="true" /> Belajar ulang
          </Button>
        </div>
      )}
      {finish.suggestion === 'challenge' && (
        <div className="rounded-xl bg-violet-50 p-4 ring-1 ring-violet-200">
          <p className="font-semibold text-violet-900">
            Kamu lancar sekali! Mau tantangan tambahan?
          </p>
          <Button className="mt-2" onClick={() => onList('challenge')}>
            <Sparkles className="size-4" aria-hidden="true" /> Ambil tantangan
          </Button>
        </div>
      )}

      {station.summary?.length > 0 && (
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <p className="mb-2 font-bold text-slate-900">Ringkasan</p>
          <ul className="space-y-1.5">
            {station.summary.map((point, index) => (
              <li key={index} className="flex gap-2">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
                <Rich text={point} user={user} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {station.reflection && (
        <div className="space-y-2 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <label htmlFor="mpi-refleksi" className="block font-bold text-slate-900">
            Refleksi: {personalize(station.reflection, user)}
          </label>
          <textarea
            id="mpi-refleksi"
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={2000}
            placeholder="Apa yang paling kamu pahami? Apa yang masih membingungkan?"
            className="block w-full rounded-lg border-0 px-3 py-2 text-base ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-brand-600 sm:text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} loading={saving} disabled={text.trim().length < 5}>
              Simpan refleksi
            </Button>
            {message && <span className="text-[0.85em] text-slate-600">{message}</span>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {onNext && (
          <Button onClick={onNext} data-present="next">
            Stasiun berikutnya <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        )}
        <Button variant="secondary" onClick={onMap}>
          <MapIcon className="size-4" aria-hidden="true" /> Kembali ke peta
        </Button>
      </div>
    </div>
  )
}

/**
 * Pemutar satu stasiun: langkah demi langkah, Periksa (dinilai server), petunjuk bertahap,
 * Tunjukkan jawaban, lalu ringkasan + refleksi + saran Belajar ulang / Tantangan.
 */
export default function StepPlayer({
  station,
  state,
  version,
  materialId,
  api,
  user,
  mascot,
  readOnly,
  reflection,
  onStepState,
  onFinished,
  onMap,
  onNext,
  onGlossary,
}) {
  const [list, setList] = useState('steps')
  const [index, setIndex] = useState(() => startIndex(station, state))
  const [values, setValues] = useState({})
  const [results, setResults] = useState({})
  const [hints, setHints] = useState({})
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState('')
  const [finish, setFinish] = useState(null)
  // Simulasi di sesi ini: {id langkah: 'done' | 'unblocked'} (unblocked = peraga gagal dimuat).
  const [simulations, setSimulations] = useState({})
  const lastMark = useRef(null)
  const topRef = useRef(null)

  const steps = list === 'steps' ? station.steps : station[list]
  const step = steps[index]
  const definition = step ? stepDefinition(step.kind) : null
  const run = state?.run ?? {}
  const result = step ? results[step.id] : null
  const baseState =
    list === 'steps' ? run[step?.id] : { done: Boolean(result?.correct || result?.revealed) }
  const simulation = step ? simulations[step.id] : undefined
  const stepState = simulation
    ? { ...baseState, done: Boolean(baseState?.done) || simulation === 'done', unblocked: true }
    : baseState
  const hintLevel = hints[step?.id] ?? 0
  const value = step ? (values[step.id] ?? initialValue(step)) : undefined
  const progress = stationProgress(station, run)
  const isLast = index === steps.length - 1

  // Catat posisi & waktu belajar setiap pindah langkah (masuk antrean jika sinyal putus).
  const stepId = step?.id
  useEffect(() => {
    if (readOnly || !stepId || list !== 'steps') return
    const now = Date.now()
    const seconds = lastMark.current
      ? Math.min(MAX_VISIT, Math.round((now - lastMark.current) / 1000))
      : 0
    lastMark.current = now
    const data = { version, station: station.id, action: 'visit', step: stepId, seconds }
    send(api, { uid: newUid(), type: 'station', materialId, data }).catch(() => {})
  }, [stepId, list, readOnly, version, station.id, api, materialId])

  useEffect(() => {
    topRef.current?.scrollIntoView?.({ block: 'start' })
  }, [index, list])
  const goTo = (target) => {
    setError('')
    setIndex(target)
  }

  if (finish) {
    return (
      <Summary
        station={station}
        finish={finish}
        reflection={reflection}
        readOnly={readOnly}
        user={user}
        onReflect={(text) =>
          send(api, {
            uid: newUid(),
            type: 'reflection',
            materialId,
            data: { version, station: station.id, text },
          })
        }
        onList={(name) => {
          setFinish(null)
          setList(name)
          setIndex(0)
        }}
        onMap={onMap}
        onNext={onNext}
      />
    )
  }
  if (!step) return null

  const answerWithRetry = async (data) => {
    // Jawaban harus dinilai server. Jika sinyal putus, coba lagi otomatis dengan id yang sama
    // (server menolak kiriman ganda) sampai online.
    for (;;) {
      try {
        const response = await api.answer(materialId, data)
        setWaiting(false)
        return response
      } catch (err) {
        if (!isNetworkError(err)) throw err
        setWaiting(true)
        await new Promise((resolve) => {
          const done = () => {
            window.removeEventListener('online', done)
            clearTimeout(timer)
            resolve()
          }
          const timer = setTimeout(done, 5000)
          window.addEventListener('online', done)
        })
      }
    }
  }

  const check = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await answerWithRetry({
        version,
        station: station.id,
        step: step.id,
        response: value,
        hint_level: hintLevel,
        client_uid: newUid(),
      })
      setResults((current) => ({ ...current, [step.id]: response }))
      if (list === 'steps') {
        const next =
          response.step_state ??
          localStepState(run[step.id], { correct: response.correct, hintLevel })
        onStepState(station.id, step.id, next)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const reveal = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await api.reveal(materialId, { version, station: station.id, step: step.id })
      setResults((current) => ({ ...current, [step.id]: { ...response, revealed: true } }))
      if (list === 'steps') {
        const next =
          response.step_state ??
          localStepState(run[step.id], { revealed: true, hintCount: step.hints?.length ?? 0 })
        onStepState(station.id, step.id, next)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const finishStation = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await api.station(materialId, {
        version,
        station: station.id,
        action: 'finish',
      })
      setFinish(response)
      onFinished?.()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const simulationDone = () => {
    if (simulations[step.id] === 'done') return
    setSimulations((current) => ({ ...current, [step.id]: 'done' }))
    if (list !== 'steps') return
    onStepState(station.id, step.id, { ...(run[step.id] ?? {}), done: true })
    if (!readOnly) {
      const data = { version, station: station.id, action: 'complete', step: step.id }
      send(api, { uid: newUid(), type: 'station', materialId, data }).catch(() => {})
    }
  }
  const simulationFailed = () =>
    setSimulations((current) =>
      current[step.id] ? current : { ...current, [step.id]: 'unblocked' },
    )

  const doneBefore = step.graded && stepState?.done && !result
  const locked = Boolean(result) || doneBefore || waiting
  const wrongCount = (run[step.id]?.mistakes ?? 0) + (result && result.correct === false ? 1 : 0)
  const allHintsOpen = hintLevel >= (step.hints?.length ?? 0)
  const canReveal = step.graded && !stepState?.done && allHintsOpen && wrongCount > 0 && !waiting
  const Component = definition?.Component
  const review = result ? { result: result.detail, key: result.key ?? null } : null

  return (
    <div className="space-y-4" ref={topRef}>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.85em] font-semibold text-slate-600">
            {LIST_TITLES[list] ? `${LIST_TITLES[list]} • ` : ''}
            {stepLabel(index, steps.length)}
          </p>
          {list === 'steps' && progress.total > 0 && (
            <p className="text-[0.85em] text-slate-500">
              Latihan tuntas {progress.done}/{progress.total}
            </p>
          )}
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
          aria-label={stepLabel(index, steps.length)}
        >
          <div
            className="h-full rounded-full bg-brand-500 transition-all motion-reduce:transition-none"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {index === 0 && list === 'steps' && station.objectives?.length > 0 && (
        <div className="rounded-xl bg-sky-50 p-4 ring-1 ring-sky-200">
          <p className="flex items-center gap-2 font-bold text-sky-900">
            <Target className="size-5" aria-hidden="true" /> Setelah ini kamu bisa:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 ps-6 text-sky-900">
            {station.objectives.map((objective, i) => (
              <li key={i}>{personalize(objective, user)}</li>
            ))}
          </ul>
        </div>
      )}

      <article className="space-y-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
        {step.title && (
          <h3 className="text-[1.15em] font-bold text-slate-900">
            {personalize(step.title, user)}
          </h3>
        )}
        {Component ? (
          <Component
            step={step}
            user={user}
            mascot={mascot}
            value={value}
            onChange={
              step.graded && !locked
                ? (value) => setValues((v) => ({ ...v, [step.id]: value }))
                : null
            }
            review={review}
            done={Boolean(stepState?.done)}
            onSimulationDone={simulationDone}
            onSimulationFail={simulationFailed}
          />
        ) : (
          <Alert type="warning">Jenis langkah “{step.kind}” belum didukung pemutar ini.</Alert>
        )}

        {doneBefore && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-brand-50 p-3 ring-1 ring-brand-200">
            <span className="flex items-center gap-2 font-semibold text-brand-800">
              <CircleCheck className="size-5" aria-hidden="true" /> Sudah kamu tuntaskan.
            </span>
            <Button variant="secondary" size="sm" onClick={reveal} loading={busy}>
              <Eye className="size-4" aria-hidden="true" /> Lihat jawaban
            </Button>
          </div>
        )}

        {visibleHints(step, hintLevel).map((hint, i) => (
          <div key={i} className="flex gap-2 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
            <Rich text={`**Petunjuk ${i + 1}:** ${hint}`} user={user} />
          </div>
        ))}

        {result && (
          <ResultPanel
            result={result}
            user={user}
            onRetry={() =>
              setResults((current) => {
                const next = { ...current }
                delete next[step.id]
                return next
              })
            }
          />
        )}
        {waiting && (
          <Alert type="warning">
            <span className="flex items-center gap-2">
              <WifiOff className="size-4" aria-hidden="true" /> Menunggu sinyal… jawabanmu akan
              dikirim otomatis.
            </span>
          </Alert>
        )}
        {error && <Alert type="error">{error}</Alert>}

        <div className="flex flex-wrap items-center gap-2">
          {step.graded && !locked && (
            <Button
              onClick={check}
              loading={busy}
              disabled={!answered(step, value)}
              className="min-h-11"
            >
              Periksa
            </Button>
          )}
          {step.graded && !stepState?.done && !result && hintLevel < (step.hints?.length ?? 0) && (
            <Button
              variant="secondary"
              className="min-h-11"
              onClick={() => setHints((h) => ({ ...h, [step.id]: hintLevel + 1 }))}
            >
              <Lightbulb className="size-4" aria-hidden="true" /> Petunjuk {hintLevel + 1}
            </Button>
          )}
          {canReveal && (
            <Button variant="ghost" className="min-h-11" onClick={reveal} loading={busy}>
              <Eye className="size-4" aria-hidden="true" /> Tunjukkan jawaban (bintang berkurang)
            </Button>
          )}
          <span className="ms-auto flex gap-2">
            <SpeakButton text={speakableText(step, user)} />
            <button
              type="button"
              onClick={onGlossary}
              className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[0.85em] font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              <BookOpen className="size-4" aria-hidden="true" /> Glosarium
            </button>
          </span>
        </div>
      </article>

      <nav className="flex items-center justify-between gap-2" aria-label="Navigasi langkah">
        <Button
          variant="secondary"
          className="min-h-12 px-5"
          disabled={index === 0}
          onClick={() => goTo(index - 1)}
          data-present="prev"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Kembali
        </Button>
        {!isLast ? (
          <Button
            className="min-h-12 px-5"
            disabled={!canAdvance(step, stepState)}
            onClick={() => goTo(index + 1)}
            data-present="next"
          >
            Lanjut <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        ) : list === 'steps' ? (
          <Button
            className="min-h-12 px-5"
            loading={busy}
            disabled={!canAdvance(step, stepState)}
            onClick={finishStation}
            data-present="next"
          >
            Selesaikan stasiun
          </Button>
        ) : (
          <Button
            className="min-h-12 px-5"
            disabled={!canAdvance(step, stepState)}
            onClick={() => setFinish({ stars: state?.stars ?? 0, badges: [], suggestion: null })}
            data-present="next"
          >
            Selesai
          </Button>
        )}
      </nav>
      {step.graded && !canAdvance(step, stepState) && (
        <p className="text-center text-[0.85em] text-slate-500">
          Jawab latihan ini dulu untuk lanjut.
        </p>
      )}
    </div>
  )
}
