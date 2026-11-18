import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react'
import { useState } from 'react'
import { codeExercisesApi } from '../../api/materials'
import { summarizeResults } from '../../utils/codePractice'
import { getErrorMessage } from '../../utils/errors'
import Alert from '../Alert'
import Button from '../Button'
import RichText from '../RichText'
import MathAnswerField from './MathAnswerField'

/** Jawaban -> teks tersimpan "1. jawaban" per baris (bentuk yang sama dengan yang disimpan server). */
function answersText(answers) {
  return answers.map((answer, index) => `${index + 1}. ${answer}`).join('\n')
}

/** Jawaban tersimpan "1. jawaban\n2. jawaban" -> ['jawaban', 'jawaban'] (untuk mengisi ulang kolom). */
function savedAnswers(code, count) {
  const answers = Array(count).fill('')
  for (const line of String(code ?? '').split('\n')) {
    const match = line.match(/^(\d+)\. (.*)$/)
    if (match && Number(match[1]) <= count) answers[Number(match[1]) - 1] = match[2]
  }
  return answers
}

/**
 * Praktik Matematika: soal dengan angka acak milik pengguna, kolom jawaban rumus, tombol Periksa.
 * Jawaban diperiksa DI SERVER (kunci tidak pernah dikirim ke browser). Hasil hanya benar/belum per soal,
 * tanpa memberi tahu jawaban yang benar. `preview` = guru mencoba (tidak disimpan).
 */
export default function MathWorkspace({
  exercise,
  preview = false,
  initialCode,
  initialPassed,
  onCodeChange,
  onSaved,
}) {
  const questions = exercise.questions ?? []
  const [answers, setAnswersState] = useState(() =>
    savedAnswers(initialCode ?? exercise.my_attempt?.code, questions.length),
  )
  // Draf ikut dilaporkan ke modal agar tidak hilang saat pindah soal.
  const setAnswers = (update) => {
    const next = update(answers)
    setAnswersState(next)
    onCodeChange?.(answersText(next))
  }
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [passed, setPassed] = useState(Boolean(initialPassed ?? exercise.my_attempt?.passed))

  const check = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await codeExercisesApi.check(exercise.id, answers)
      setResults(data.results)
      if (data.attempt) {
        if (data.attempt.passed) setPassed(true)
        onSaved?.(data)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const summary = results && summarizeResults(results)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900">{exercise.title}</h3>
          {exercise.instructions && (
            <RichText
              text={exercise.instructions}
              className="mt-1 text-sm whitespace-pre-line text-slate-700"
            />
          )}
        </div>
        {passed && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-800">
            <CheckCircle2 className="size-3.5" aria-hidden="true" /> Lulus
          </span>
        )}
      </div>

      <ol className="space-y-4">
        {questions.map((item, index) => {
          const result = results?.[index]
          return (
            <li key={index} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="flex items-start gap-2">
                <span className="font-semibold text-slate-700">{index + 1}.</span>
                <RichText text={item.question} className="min-w-0 flex-1 text-slate-800" />
                {result &&
                  (result.ok ? (
                    <CheckCircle2 className="size-5 shrink-0 text-brand-600" aria-label="Benar" />
                  ) : (
                    <XCircle className="size-5 shrink-0 text-red-500" aria-label="Belum benar" />
                  ))}
              </div>
              <div className="mt-2 pl-5">
                <MathAnswerField
                  label={`Jawaban soal ${index + 1}`}
                  value={answers[index]}
                  disabled={busy}
                  onChange={(value) =>
                    setAnswers((list) => list.map((old, i) => (i === index ? value : old)))
                  }
                />
                {result && !result.ok && result.message && (
                  <p className="mt-1 text-xs text-red-600">{result.message}</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={check} loading={busy}>
          <ShieldCheck className="size-4" aria-hidden="true" /> Periksa
        </Button>
        {summary && (
          <span className={`text-sm ${summary.done ? 'text-brand-700' : 'text-red-600'}`}>
            {summary.passed}/{summary.total} benar
          </span>
        )}
        {preview && (
          <span className="text-xs text-slate-500">
            Mode coba: angka soal milik Anda sendiri, tidak disimpan.
          </span>
        )}
      </div>
      <Alert type="error">{error}</Alert>
      <p className="text-xs text-slate-500">
        Tulis jawaban seperti di buku: pecahan, akar, dan pangkat bisa dipilih di papan ketik rumus.
        Bentuk yang setara tetap benar, mis. 1/2 = 0,5 dan 2x + 3 = 3 + 2x.
      </p>
      {summary?.done && (
        <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-800">
          Hebat! Semua jawaban benar{preview ? ' (mode coba).' : '. Pekerjaanmu sudah tersimpan.'}
        </p>
      )}
    </div>
  )
}
