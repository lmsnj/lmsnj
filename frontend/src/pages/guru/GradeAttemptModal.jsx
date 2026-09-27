import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { attemptsApi } from '../../api/assessments'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import TextAreaField from '../../components/TextAreaField'
import TextField from '../../components/TextField'
import useFetch from '../../hooks/useFetch'
import { choiceLetter } from '../../utils/assessments'
import { getErrorMessage } from '../../utils/errors'
import { formatScore, parseScore } from '../../utils/tasks'

const timeFormat = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})
const formatTime = (value) => timeFormat.format(new Date(value))

function ChoiceAnswer({ question }) {
  const chosen = question.answer?.choice
  return (
    <ul className="space-y-1 text-sm">
      {question.choices.map((choice, index) => {
        const isCorrect = index === question.correct_choice
        const isChosen = index === chosen
        return (
          <li
            key={index}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${
              isCorrect
                ? 'bg-brand-50 text-brand-800'
                : isChosen
                  ? 'bg-red-50 text-red-700'
                  : 'text-slate-600'
            }`}
          >
            <span className="font-semibold">{choiceLetter(index)}.</span>
            <span className="flex-1">{choice}</span>
            {isChosen && <span className="text-xs font-medium">jawaban siswa</span>}
            {isCorrect && <Check className="size-4" aria-label="jawaban benar" />}
            {isChosen && !isCorrect && <X className="size-4" aria-label="salah" />}
          </li>
        )
      })}
      {chosen === null && <li className="px-3 text-xs text-slate-500">Tidak dijawab.</li>}
    </ul>
  )
}

// Periksa satu pengerjaan: pilihan ganda sudah otomatis, esai diberi poin & umpan balik.
export default function GradeAttemptModal({ attemptId, onClose, onSaved }) {
  const sheet = useFetch(attemptsApi.get, attemptId)
  // Nilai isian guru per id jawaban: { points: '5', feedback: '' }
  const [grades, setGrades] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const questions = sheet.data?.questions ?? []
  const valueFor = (q, field) =>
    grades[q.answer.id]?.[field] ??
    (field === 'points'
      ? q.answer.points === null
        ? ''
        : String(q.answer.points).replace('.', ',')
      : q.answer.feedback)

  const setGrade = (q, field, value) =>
    setGrades((current) => ({
      ...current,
      [q.answer.id]: {
        points: valueFor(q, 'points'),
        feedback: valueFor(q, 'feedback'),
        ...current[q.answer.id],
        [field]: value,
      },
    }))

  const save = async () => {
    const payload = []
    for (const [answerId, grade] of Object.entries(grades)) {
      const question = questions.find((q) => q.answer?.id === Number(answerId))
      const points = parseScore(grade.points)
      if (points === null || Number.isNaN(points) || points > question.points) {
        setError(`Isi poin 0 sampai ${question.points} untuk setiap esai yang dinilai.`)
        return
      }
      payload.push({ answer: Number(answerId), points, feedback: grade.feedback })
    }
    if (!payload.length) return onClose()
    setSaving(true)
    setError('')
    try {
      const saved = await attemptsApi.grade(attemptId, payload)
      onSaved(saved)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const data = sheet.data
  return (
    <Modal
      open
      size="lg"
      title={data ? `Jawaban ${data.student.full_name}` : 'Memuat...'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          <Button loading={saving} onClick={save} disabled={!data}>
            Simpan Nilai
          </Button>
        </>
      }
    >
      {sheet.error && <Alert type="error">{sheet.error}</Alert>}
      {!data ? (
        <div className="py-10 text-center text-brand-600">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-slate-600">
            Nilai sementara: <strong>{formatScore(data.attempt.auto_score)}</strong>
            {data.attempt.score !== null && (
              <>
                {' '}
                · Nilai akhir:{' '}
                <strong className="text-brand-700">{formatScore(data.attempt.score)}</strong>
              </>
            )}
            {data.attempt.is_late && (
              <span className="text-amber-700"> · dikumpulkan terlambat</span>
            )}
          </p>
          <Alert type="error">{error}</Alert>
          {data.events.length > 0 && (
            <section className="rounded-lg bg-red-50 p-3 text-sm ring-1 ring-red-200">
              <p className="font-semibold text-red-800">
                Catatan pengawasan: keluar halaman {data.events.length}×
                {data.attempt.auto_submitted && ' — dikumpulkan otomatis oleh sistem'}
              </p>
              <ul className="mt-1 space-y-0.5 text-red-700">
                {data.events.map((event, index) => (
                  <li key={index}>
                    {formatTime(event.created_at)} — {event.label}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {questions.map((q, index) => (
            <section key={q.id} className="rounded-lg p-4 ring-1 ring-slate-200">
              <div className="mb-2 flex items-start justify-between gap-3">
                <p className="font-medium text-slate-900">
                  {index + 1}. <span className="whitespace-pre-line">{q.text}</span>
                </p>
                <span className="shrink-0 text-xs text-slate-500">{q.points} poin</span>
              </div>
              {q.kind === 'choice' ? (
                <>
                  <ChoiceAnswer question={q} />
                  <p className="mt-2 text-right text-sm text-slate-600">
                    Poin: <strong>{formatScore(q.answer?.points)}</strong>
                  </p>
                </>
              ) : (
                <>
                  <div className="rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap text-slate-800 ring-1 ring-slate-200">
                    {q.answer?.text || (
                      <span className="text-slate-400">(tidak dijawab — otomatis 0)</span>
                    )}
                  </div>
                  {q.answer?.text && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_1fr]">
                      <TextField
                        label={`Poin (0–${q.points})`}
                        value={valueFor(q, 'points')}
                        onChange={(event) => setGrade(q, 'points', event.target.value)}
                        inputMode="decimal"
                      />
                      <TextAreaField
                        label="Umpan balik (opsional)"
                        value={valueFor(q, 'feedback')}
                        onChange={(event) => setGrade(q, 'feedback', event.target.value)}
                        rows={2}
                      />
                    </div>
                  )}
                </>
              )}
            </section>
          ))}
        </div>
      )}
    </Modal>
  )
}
