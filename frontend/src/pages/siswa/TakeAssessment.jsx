import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Grid3x3,
  Info,
  Maximize,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { assessmentsApi } from '../../api/assessments'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import { ChoiceContent, QuestionText, Stimulus } from '../../components/QuestionContent'
import useAuth from '../../hooks/useAuth'
import useExamGuard, {
  enterFullscreen,
  exitFullscreen,
  fullscreenSupported,
} from '../../hooks/useExamGuard'
import { choiceLetter, formatCountdown, questionDir } from '../../utils/assessments'
import { getErrorMessage } from '../../utils/errors'
import {
  categoryLabels,
  choiceKeyIndex,
  instructionFor,
  isAnswered,
  questionStatus,
  restoreExamState,
  setCategory,
  sharedStimuli,
  toggleChoice,
  toPayload,
} from '../../utils/exam'

const DRAFT_SYNC_MS = 1500
// Ukuran huruf soal (A- / A / A+). Isi soal memakai satuan em agar ikut membesar.
const FONT_SIZES = ['15px', '17px', '19px', '22px']
const DEFAULT_FONT = 1
const FONT_KEY = 'lms-ujian-ukuran-huruf'

const VIOLATION_TEXT = {
  hidden: 'pindah tab atau membuka aplikasi lain',
  blur: 'membuka jendela lain',
  fullscreen_exit: 'keluar dari layar penuh',
  navigate: 'mencoba meninggalkan halaman ujian',
}

// Salinan jawaban di perangkat, agar tidak hilang saat halaman ter-refresh atau sinyal putus.
const draftKey = (attemptId) => `lms-asesmen-${attemptId}`

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null // penyimpanan perangkat rusak/nonaktif
  }
}

function writeStorage(key, value) {
  try {
    if (value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // penyimpanan perangkat penuh/nonaktif: jawaban tetap tersimpan di server
  }
}

function Countdown({ deadline, clockOffset, onExpire }) {
  const [now, setNow] = useState(() => Date.now())
  const expired = useRef(false)
  const remaining = new Date(deadline).getTime() - (now + clockOffset)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (remaining <= 0 && !expired.current) {
      expired.current = true
      onExpire()
    }
  }, [remaining, onExpire])

  const low = remaining < 5 * 60 * 1000
  return (
    <div
      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-lg font-bold tabular-nums sm:text-xl ${
        low ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'
      }`}
      role="timer"
      aria-live="off"
      aria-label="Sisa waktu"
    >
      <Clock className="size-5" aria-hidden="true" />
      {formatCountdown(remaining)}
    </div>
  )
}

function FontSizeControl({ value, onChange }) {
  const buttons = [
    { label: 'A-', aria: 'Perkecil huruf', next: Math.max(0, value - 1), size: 'text-xs' },
    { label: 'A', aria: 'Ukuran huruf normal', next: DEFAULT_FONT, size: 'text-sm' },
    {
      label: 'A+',
      aria: 'Perbesar huruf',
      next: Math.min(FONT_SIZES.length - 1, value + 1),
      size: 'text-base',
    },
  ]
  return (
    <div
      role="group"
      aria-label="Ukuran huruf soal"
      className="flex shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-300"
    >
      {buttons.map((button) => (
        <button
          key={button.label}
          type="button"
          onClick={() => onChange(button.next)}
          aria-label={button.aria}
          className={`w-8 py-1 font-bold text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100 sm:w-9 ${button.size}`}
        >
          {button.label}
        </button>
      ))}
    </div>
  )
}

const NUMBER_STYLES = {
  current: 'bg-white text-slate-900 ring-[3px] ring-orange-500',
  flagged: 'bg-yellow-300 text-slate-900 ring-1 ring-yellow-500',
  answered: 'bg-brand-600 text-white',
  empty: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200',
}

function NumberButton({ number, answered, flagged, current, onClick }) {
  const status = questionStatus({ answered, flagged, current })
  const description = [
    answered ? 'sudah dijawab' : 'belum dijawab',
    flagged && 'ragu-ragu',
    current && 'sedang dibuka',
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? 'step' : undefined}
      aria-label={`Soal ${number}, ${description}`}
      className={`relative flex size-11 items-center justify-center rounded-full text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${NUMBER_STYLES[status]}`}
    >
      {number}
      {flagged && (
        <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-slate-900 text-yellow-300 ring-2 ring-white">
          <Flag className="size-3" aria-hidden="true" />
        </span>
      )}
    </button>
  )
}

function Legend() {
  const items = [
    ['empty', 'Belum dijawab'],
    ['current', 'Soal yang sedang dibuka'],
    ['answered', 'Sudah dijawab'],
    ['flagged', 'Ragu-ragu (ada ikon bendera)'],
  ]
  return (
    <ul className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700 ring-1 ring-slate-200">
      {items.map(([status, label]) => (
        <li key={status} className="flex items-center gap-2">
          <span
            className={`relative inline-flex size-6 shrink-0 rounded-full ${NUMBER_STYLES[status]}`}
          >
            {status === 'flagged' && (
              <Flag className="m-auto size-3 text-slate-900" aria-hidden="true" />
            )}
          </span>
          {label}
        </li>
      ))}
    </ul>
  )
}

function NumberPanel({
  questions,
  answers,
  flags,
  current,
  onSelect,
  onFinish,
  submitting,
  violations,
  limit,
  needFullscreen,
}) {
  const [legendOpen, setLegendOpen] = useState(false)
  const answeredCount = questions.filter((q) => isAnswered(q, answers[q.id])).length
  const flaggedCount = questions.filter((q) => flags[q.id]).length
  return (
    <div>
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-bold tracking-wider text-slate-900 uppercase">Nomor Soal</h2>
        <button
          type="button"
          onClick={() => setLegendOpen((open) => !open)}
          aria-expanded={legendOpen}
          aria-label="Keterangan warna nomor soal"
          className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          <Info className="size-5 fill-slate-900 text-white" aria-hidden="true" />
        </button>
      </div>
      {legendOpen && <Legend />}
      <ol className="mt-4 grid grid-cols-5 justify-items-center gap-x-2 gap-y-3">
        {questions.map((q, index) => (
          <li key={q.id}>
            <NumberButton
              number={index + 1}
              answered={isAnswered(q, answers[q.id])}
              flagged={Boolean(flags[q.id])}
              current={index === current}
              onClick={() => onSelect(index)}
            />
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-slate-600">
        {answeredCount} dari {questions.length} soal terjawab
        {flaggedCount > 0 && ` · ${flaggedCount} ragu-ragu`}
      </p>
      <Button className="mt-4 w-full" loading={submitting} onClick={onFinish}>
        Selesai Ujian
      </Button>
      <p className="mt-4 flex gap-1.5 text-xs text-slate-500">
        <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
        <span>
          Mode ujian diawasi: pindah tab, membuka aplikasi lain
          {needFullscreen ? ', atau keluar dari layar penuh' : ''} dicatat dan dilihat guru.
          {limit > 0 && ` Setelah ${limit} kali, jawaban otomatis dikumpulkan.`}
          {violations > 0 && (
            <strong className="block text-red-600">
              Keluar halaman: {violations}
              {limit ? ` dari ${limit}` : '×'}
            </strong>
          )}
        </span>
      </p>
    </div>
  )
}

function Instructions({ question }) {
  return (
    <div className="flex gap-3 rounded-xl bg-sky-50 p-4 text-sky-950 ring-1 ring-sky-100">
      <Info className="mt-[0.2em] size-5 shrink-0 fill-sky-700 text-white" aria-hidden="true" />
      <p>
        <strong>Petunjuk Pengerjaan:</strong> {instructionFor(question)}
      </p>
    </div>
  )
}

// PG sederhana (lingkaran huruf) dan PG kompleks (kotak centang): kartu selebar penuh.
function ChoiceCards({ question, value, number, onPick }) {
  const multiple = question.kind === 'multiple'
  const isSelected = (i) => (multiple ? Array.isArray(value) && value.includes(i) : value === i)
  return (
    <div
      role={multiple ? 'group' : 'radiogroup'}
      aria-label={`Pilihan jawaban soal ${number}`}
      dir={questionDir(question)}
      className="space-y-4"
    >
      {question.choices.map((_, i) => {
        const selected = isSelected(i)
        return (
          <label
            key={i}
            className={`flex cursor-pointer items-start gap-4 rounded-xl border bg-white p-4 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-slate-900 sm:px-5 ${
              selected
                ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
                : 'border-slate-300 hover:border-slate-500'
            }`}
          >
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={`q-${question.id}`}
              checked={selected}
              onChange={() => onPick(i)}
              className="sr-only"
              data-exam-choice
            />
            {multiple ? (
              <span
                aria-hidden="true"
                className={`mt-[0.1em] flex size-[1.9em] shrink-0 items-center justify-center rounded-md border-2 ${
                  selected
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-400 bg-white text-transparent'
                }`}
              >
                <Check className="size-[1.2em]" strokeWidth={3} />
              </span>
            ) : (
              <span
                aria-hidden="true"
                className={`mt-[0.1em] flex size-[1.9em] shrink-0 items-center justify-center rounded-full border-2 font-bold ${
                  selected
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                {choiceLetter(i)}
              </span>
            )}
            <span className="flex min-w-0 flex-1 gap-2 pt-[0.2em]">
              {multiple ? (
                <span className="font-semibold text-slate-500">{choiceLetter(i)}.</span>
              ) : (
                <span className="sr-only">{choiceLetter(i)}. </span>
              )}
              <ChoiceContent question={question} index={i} />
            </span>
          </label>
        )
      })}
    </div>
  )
}

// PG kompleks kategori: tabel Pernyataan | Benar | Salah (label mengikuti pengaturan soal).
function CategoryTable({ question, value, number, onPick }) {
  const labels = categoryLabels(question)
  return (
    <div className="overflow-x-auto">
      <table
        dir={questionDir(question)}
        className="w-full min-w-[26rem] border-collapse overflow-hidden rounded-xl ring-1 ring-slate-300"
      >
        <thead>
          <tr className="bg-slate-100 text-slate-900">
            <th className="border border-slate-300 px-4 py-3 text-start">Pernyataan</th>
            {labels.map((label) => (
              <th key={label} className="w-28 border border-slate-300 px-2 py-3 text-center">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {question.choices.map((_, s) => (
            <tr key={s} className="bg-white">
              <td className="border border-slate-300 px-4 py-3">
                <span className="flex gap-2">
                  <span className="font-semibold text-slate-500">{s + 1}.</span>
                  <ChoiceContent question={question} index={s} />
                </span>
              </td>
              {labels.map((label, l) => (
                <td key={label} className="border border-slate-300 p-0 text-center">
                  <label className="flex cursor-pointer items-center justify-center p-3 hover:bg-slate-50">
                    <input
                      type="radio"
                      name={`q-${question.id}-${s}`}
                      checked={Array.isArray(value) && value[s] === l}
                      onChange={() => onPick(s, l)}
                      aria-label={`Soal ${number} pernyataan ${s + 1}: ${label}`}
                      className="size-6 cursor-pointer accent-brand-600"
                    />
                  </label>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AnswerArea({ question, value, number, onChange }) {
  if (question.kind === 'choice') {
    return <ChoiceCards question={question} value={value} number={number} onPick={onChange} />
  }
  if (question.kind === 'multiple') {
    return (
      <ChoiceCards
        question={question}
        value={value}
        number={number}
        onPick={(i) => onChange(toggleChoice(value, i))}
      />
    )
  }
  if (question.kind === 'category') {
    return (
      <CategoryTable
        question={question}
        value={value}
        number={number}
        onPick={(s, l) => onChange(setCategory(question, value, s, l))}
      />
    )
  }
  return (
    <textarea
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      rows={8}
      dir={questionDir(question)}
      placeholder="Tulis jawabanmu di sini..."
      aria-label={`Jawaban soal ${number}`}
      className="block w-full rounded-xl border-0 px-4 py-3 text-[1em] leading-relaxed ring-1 ring-slate-300 ring-inset select-text focus:ring-2 focus:ring-brand-600"
    />
  )
}

/**
 * Mode ujian bergaya simulasi TKA: sidebar nomor soal + satu soal per layar. Tampil menutupi
 * seluruh aplikasi (menu disembunyikan) dan diawasi useExamGuard.
 * `onSubmitted(result)` dipanggil setelah dikumpulkan (manual, waktu habis, atau otomatis).
 */
export default function TakeAssessment({ assessment, data, onSubmitted }) {
  const { user } = useAuth()
  const attempt = data.attempt
  const questions = data.questions
  const rules = data.rules ?? { max_violations: 0, require_fullscreen: false }
  const needFullscreen = rules.require_fullscreen && fullscreenSupported()

  const [initial] = useState(() =>
    restoreExamState(readStorage(draftKey(attempt.id)), questions, data.draft),
  )
  const [answers, setAnswers] = useState(initial.answers)
  const [flags, setFlags] = useState(initial.flags)
  const [current, setCurrent] = useState(initial.current)
  const [fontSize, setFontSize] = useState(() => {
    const saved = readStorage(FONT_KEY)
    return Number.isInteger(saved) && FONT_SIZES[saved] ? saved : DEFAULT_FONT
  })
  const [navOpen, setNavOpen] = useState(false)
  const [violations, setViolations] = useState(attempt.violation_count ?? 0)
  const [warning, setWarning] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement))
  // Selisih jam perangkat dengan jam server, agar timer tidak tertipu jam HP yang salah.
  const [clockOffset] = useState(() => new Date(data.server_time).getTime() - Date.now())
  const shared = useMemo(() => sharedStimuli(questions), [questions])
  const mainRef = useRef(null)

  const answersRef = useRef(answers)
  const flagsRef = useRef(flags)
  useEffect(() => {
    answersRef.current = answers
    flagsRef.current = flags
    // Simpan juga ke server (dipakai jika jawaban dikumpulkan otomatis atau pindah perangkat).
    const timer = setTimeout(() => {
      assessmentsApi.saveDraft(assessment.id, toPayload(questions, answers, flags)).catch(() => {})
    }, DRAFT_SYNC_MS)
    return () => clearTimeout(timer)
  }, [answers, flags, assessment.id, questions])

  useEffect(() => {
    if (!finished) writeStorage(draftKey(attempt.id), { answers, flags, current })
  }, [answers, flags, current, attempt.id, finished])

  useEffect(() => writeStorage(FONT_KEY, fontSize), [fontSize])

  useEffect(() => {
    const update = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  // Soal baru selalu dibuka dari atas.
  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 })
  }, [current])

  const finish = useCallback(
    (result) => {
      setFinished(true)
      writeStorage(draftKey(attempt.id), undefined)
      exitFullscreen()
      onSubmitted(result)
    },
    [attempt.id, onSubmitted],
  )

  const handleViolation = useCallback(
    async (kind) => {
      setWarning(kind)
      try {
        // Kirim jawaban terbaru dulu, agar pengumpulan otomatis memakai jawaban paling baru.
        await assessmentsApi.saveDraft(
          assessment.id,
          toPayload(questions, answersRef.current, flagsRef.current),
        )
        const res = await assessmentsApi.violation(assessment.id, kind)
        if (res.attempt.status === 'in_progress') setViolations(res.attempt.violation_count)
        else finish(res)
      } catch {
        // Gagal terhubung: peringatan tetap tampil; pencatatan dicoba lagi pada kejadian berikutnya.
      }
    },
    [assessment.id, questions, finish],
  )

  const blocker = useExamGuard({
    active: !finished,
    requireFullscreen: needFullscreen,
    onViolation: handleViolation,
  })

  const submit = useCallback(async () => {
    setSubmitting(true)
    setError('')
    try {
      finish(await assessmentsApi.submit(assessment.id, toPayload(questions, answersRef.current)))
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal mengumpulkan. Periksa koneksi lalu coba lagi.'))
      setSubmitting(false)
      setConfirming(false)
    }
  }, [assessment.id, questions, finish])

  const leaveAnyway = async () => {
    await assessmentsApi.violation(assessment.id, 'navigate').catch(() => {})
    exitFullscreen()
    blocker.proceed()
  }

  const question = questions[current]
  const isLast = current === questions.length - 1
  const setAnswer = useCallback(
    (questionId, value) => setAnswers((all) => ({ ...all, [questionId]: value })),
    [],
  )
  const goTo = useCallback(
    (index) => {
      setCurrent(Math.min(Math.max(index, 0), questions.length - 1))
      setNavOpen(false)
    },
    [questions.length],
  )
  const toggleFlag = () => setFlags((all) => ({ ...all, [question.id]: !all[question.id] }))

  // Pintasan keyboard: panah kiri/kanan = pindah soal, A-E = pilih opsi PG sederhana.
  const dialogOpen = confirming || Boolean(warning) || navOpen || blocker.state === 'blocked'
  useEffect(() => {
    const onKey = (event) => {
      if (dialogOpen || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
        return
      }
      const target = event.target
      const typing = target.closest?.('textarea, input:not([type=radio]):not([type=checkbox])')
      // Radio di tabel kategori memakai panah bawaan browser untuk memilih label.
      const nativeRadio = target.matches?.('input[type=radio]:not([data-exam-choice])')
      if (typing || nativeRadio) return
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault()
        goTo(current + (event.key === 'ArrowRight' ? 1 : -1))
      } else if (question.kind === 'choice') {
        const index = choiceKeyIndex(event.key)
        if (index >= 0 && index < question.choices.length) {
          event.preventDefault()
          setAnswer(question.id, index)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogOpen, current, question, goTo, setAnswer])

  const unanswered = questions.filter((q) => !isAnswered(q, answers[q.id])).length
  const flaggedCount = questions.filter((q) => flags[q.id]).length
  const limit = rules.max_violations
  const group = shared[current]
  // Soal grup: stimulus bersama di panel kiri area soal (bisa digulir sendiri) pada layar lebar.
  const split = Boolean(group)
  const panel = (
    <NumberPanel
      questions={questions}
      answers={answers}
      flags={flags}
      current={current}
      onSelect={goTo}
      onFinish={() => setConfirming(true)}
      submitting={submitting}
      violations={violations}
      limit={limit}
      needFullscreen={needFullscreen}
    />
  )

  return (
    // Mode ujian: menutupi header & menu aplikasi agar tidak bisa berpindah halaman.
    <div
      className="fixed inset-0 z-40 flex flex-col bg-white text-slate-900"
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold sm:text-base">{assessment.title}</p>
          <p className="truncate text-xs text-slate-500">
            {user?.full_name}
            {assessment.subject_name && ` · ${assessment.subject_name}`}
          </p>
        </div>
        <FontSizeControl value={fontSize} onChange={setFontSize} />
        <Countdown deadline={attempt.deadline} clockOffset={clockOffset} onExpire={submit} />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden shrink-0 overflow-y-auto border-r border-slate-200 p-5 lg:block lg:w-72 xl:w-1/4">
          {panel}
        </aside>

        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto">
          <div
            style={{ fontSize: FONT_SIZES[fontSize] }}
            className={`mx-auto px-4 pt-6 pb-24 leading-[1.8] select-none sm:px-8 lg:pb-8 ${
              split ? 'max-w-7xl' : 'max-w-4xl'
            }`}
          >
            <Alert type="error" className="mb-4">
              {error}
            </Alert>
            <div className={split ? 'gap-8 lg:grid lg:grid-cols-2 lg:items-start' : ''}>
              {split && (
                <Stimulus
                  question={group.source}
                  label={`Stimulus soal nomor ${group.from}–${group.to}`}
                  className="mb-6 p-4 sm:p-5 lg:sticky lg:top-0 lg:mb-0 lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto"
                />
              )}
              <section aria-labelledby="judul-soal" className="space-y-5">
                <h1
                  id="judul-soal"
                  className="flex flex-wrap items-baseline gap-x-3 text-[1.2em] font-bold"
                >
                  Soal Nomor {current + 1}
                  <span className="text-[0.7em] font-normal text-slate-500">
                    {question.points} poin
                  </span>
                </h1>
                {!split || group.source.id !== question.id ? (
                  <Stimulus question={question} className="p-4 sm:p-5" />
                ) : null}
                <QuestionText question={question} className="text-slate-900" />
                <Instructions question={question} />
                <AnswerArea
                  key={question.id}
                  question={question}
                  value={answers[question.id]}
                  number={current + 1}
                  onChange={(value) => setAnswer(question.id, value)}
                />
              </section>
            </div>
          </div>
        </main>
      </div>

      <footer className="shrink-0 border-t border-slate-200 bg-white px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2">
          <Button variant="secondary" disabled={current === 0} onClick={() => goTo(current - 1)}>
            <ChevronLeft className="hidden size-4 sm:block" aria-hidden="true" />
            Sebelumnya
          </Button>
          <button
            type="button"
            onClick={toggleFlag}
            aria-pressed={Boolean(flags[question.id])}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 sm:px-4 ${
              flags[question.id]
                ? 'bg-yellow-300 text-slate-900 ring-1 ring-yellow-500'
                : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-yellow-50'
            }`}
          >
            <Flag className="size-4" aria-hidden="true" />
            Ragu-ragu
          </button>
          {isLast ? (
            <Button loading={submitting} onClick={() => setConfirming(true)}>
              Selesai
              <Check className="hidden size-4 sm:block" aria-hidden="true" />
            </Button>
          ) : (
            <Button onClick={() => goTo(current + 1)}>
              Berikutnya
              <ChevronRight className="hidden size-4 sm:block" aria-hidden="true" />
            </Button>
          )}
        </div>
      </footer>

      {/* HP/tablet: daftar nomor soal dibuka lewat tombol melayang. */}
      <button
        type="button"
        onClick={() => setNavOpen(true)}
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg lg:hidden"
      >
        <Grid3x3 className="size-4" aria-hidden="true" />
        Nomor Soal
      </button>
      {navOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Nomor soal"
        >
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setNavOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] overflow-y-auto bg-white p-5 pt-[max(1.25rem,env(safe-area-inset-top))] shadow-xl">
            <button
              type="button"
              onClick={() => setNavOpen(false)}
              className="absolute top-3 right-3 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Tutup nomor soal"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            {panel}
          </div>
        </div>
      )}

      {/* Layar penuh wajib tetapi sedang tidak aktif: soal ditutup sampai siswa kembali. */}
      {needFullscreen && !isFullscreen && !finished && !warning && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/80 p-4">
          <div className="max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
            <Maximize className="mx-auto size-10 text-brand-600" aria-hidden="true" />
            <p className="mt-3 font-semibold text-slate-900">
              Asesmen ini wajib dikerjakan dalam layar penuh
            </p>
            <Button className="mt-4" onClick={enterFullscreen}>
              Masuk Layar Penuh
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={Boolean(warning)}
        title="⚠️ Peringatan Pengawasan"
        onClose={() => setWarning(null)}
        footer={
          <Button
            onClick={() => {
              setWarning(null)
              if (needFullscreen) enterFullscreen()
            }}
          >
            Kembali Mengerjakan
          </Button>
        }
      >
        <div className="space-y-2 text-sm text-slate-700">
          <p>
            Anda terdeteksi <strong className="text-red-600">{VIOLATION_TEXT[warning]}</strong> saat
            mengerjakan asesmen. Kejadian ini <strong>dicatat dan dilaporkan ke guru</strong>.
          </p>
          {limit > 0 ? (
            <p className="rounded-lg bg-red-50 p-3 font-medium text-red-700">
              Pelanggaran {violations} dari {limit}. Jika mencapai {limit}, jawaban Anda otomatis
              dikumpulkan.
            </p>
          ) : (
            <p>Tetap di halaman ini sampai selesai mengerjakan.</p>
          )}
        </div>
      </Modal>

      <Modal
        open={blocker.state === 'blocked'}
        title="Tinggalkan halaman ujian?"
        onClose={() => blocker.reset?.()}
        footer={
          <>
            <Button variant="danger" onClick={leaveAnyway}>
              Tinggalkan (dicatat)
            </Button>
            <Button onClick={() => blocker.reset?.()}>Tetap Mengerjakan</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Anda sedang mengerjakan asesmen. Jika meninggalkan halaman ini, kejadian dicatat dan waktu
          tetap berjalan.
        </p>
      </Modal>

      <Modal
        open={confirming}
        title="Selesai Ujian?"
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Periksa Lagi
            </Button>
            <Button loading={submitting} onClick={submit}>
              Ya, Kumpulkan
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-slate-600">
          {unanswered > 0 ? (
            <p>
              Masih ada <strong className="text-red-600">{unanswered} soal belum dijawab</strong>{' '}
              (atau belum lengkap).
            </p>
          ) : (
            <p>Semua soal sudah dijawab.</p>
          )}
          {flaggedCount > 0 && (
            <p>
              <Flag className="mr-1 inline size-4 text-yellow-600" aria-hidden="true" />
              {flaggedCount} soal masih ditandai <strong>ragu-ragu</strong>.
            </p>
          )}
          <p>Setelah dikumpulkan, jawaban tidak bisa diubah lagi.</p>
        </div>
      </Modal>
    </div>
  )
}
