import { CircleCheck, CircleX } from 'lucide-react'
import { useState } from 'react'
import { materialsApi } from '../api/materials'
import useFetch from '../hooks/useFetch'
import { getErrorMessage } from '../utils/errors'
import { isSubComplete } from '../utils/interactive'
import Alert from './Alert'
import Button from './Button'
import CheckpointQuestion from './interactive/CheckpointQuestion'
import RichText from './RichText'
import Spinner from './Spinner'

/**
 * Kuis kecil satu capaian materi (2-5 soal: pilihan ganda, isian, tarik & lepas, menjodohkan).
 * Siswa: benar semua = capaian tercentang (`onPassed(materiTerbaru)`); salah = boleh coba lagi.
 * Guru (`preview`): mencoba kuis tanpa menyimpan apa pun.
 */
export default function ObjectiveQuiz({ material, index, preview = false, onPassed, onClose }) {
  const quiz = useFetch(materialsApi.objectiveQuiz, { id: material.id, index })
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const items = quiz.data?.items ?? []
  const unanswered = items.filter((item) => !isSubComplete(item, answers[item.id])).length

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await materialsApi.submitObjectiveQuiz(material.id, index, answers)
      setResult(data)
      if (data.passed && data.material) onPassed?.(data.material)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (quiz.error) return <Alert type="error">{quiz.error}</Alert>
  if (!quiz.data) {
    return (
      <div className="py-6 text-center text-brand-600">
        <Spinner />
      </div>
    )
  }

  const wrong = result ? Object.values(result.results).filter((r) => !r.correct).length : 0
  return (
    <div className="space-y-4 rounded-xl bg-white p-4 ring-1 ring-sky-200">
      <p className="text-xs font-semibold tracking-wide text-sky-800 uppercase">
        {preview ? 'Pratinjau kuis capaian' : 'Kuis capaian'} &middot; {items.length} soal
      </p>
      <ol className="space-y-5">
        {items.map((item, number) => {
          const itemResult = result?.results[item.id]
          return (
            <li key={item.id} className="space-y-2">
              <div className="flex items-start gap-2 text-sm font-medium text-slate-900">
                <span className="shrink-0">{number + 1}.</span>
                <RichText text={item.text} className="min-w-0 flex-1" />
                {itemResult &&
                  (itemResult.correct ? (
                    <CircleCheck className="size-5 shrink-0 text-brand-600" aria-label="benar" />
                  ) : (
                    <CircleX className="size-5 shrink-0 text-red-600" aria-label="belum tepat" />
                  ))}
              </div>
              <CheckpointQuestion
                checkpoint={item}
                value={answers[item.id]}
                onChange={
                  result?.passed
                    ? undefined
                    : (value) => setAnswers({ ...answers, [item.id]: value })
                }
              />
              {itemResult?.explanation && (
                <p className="rounded-lg bg-brand-50 p-2 text-xs text-brand-900">
                  {itemResult.explanation}
                </p>
              )}
            </li>
          )
        })}
      </ol>
      <Alert type="error">{error}</Alert>
      {result &&
        (result.passed ? (
          <Alert type="success">
            {preview
              ? 'Semua jawaban benar (pratinjau, tidak disimpan).'
              : 'Hebat! Semua jawaban benar, capaian ini tercapai.'}
          </Alert>
        ) : (
          <Alert type="info">
            {wrong} soal belum tepat (bertanda ✗). Pelajari lagi materinya, perbaiki jawaban, lalu
            periksa kembali.
          </Alert>
        ))}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>
          {result?.passed ? 'Tutup' : 'Batal'}
        </Button>
        {!result?.passed && (
          <Button size="sm" onClick={submit} loading={busy} disabled={unanswered > 0}>
            {unanswered > 0 ? `${unanswered} soal belum dijawab` : 'Periksa Jawaban'}
          </Button>
        )}
      </div>
    </div>
  )
}
