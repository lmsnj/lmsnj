import { CircleCheck, CircleX, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { materialsApi } from '../api/materials'
import useFetch from '../hooks/useFetch'
import { getErrorMessage } from '../utils/errors'
import { isSubComplete } from '../utils/interactive'
import Alert from './Alert'
import Button from './Button'
import CheckpointQuestion from './interactive/CheckpointQuestion'
import Modal from './Modal'
import RichText from './RichText'
import Spinner from './Spinner'

// Garis kemajuan bersegmen: satu segmen per soal, segmen sampai soal aktif berwarna.
function StepBar({ total, current }) {
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={`h-2 flex-1 rounded-full ${index <= current ? 'bg-brand-600' : 'bg-slate-200'}`}
        />
      ))}
    </div>
  )
}

// Hasil pemeriksaan: lulus = semua soal + pembahasan; belum = nomor yang salah + tombol Ulangi.
function ResultView({ items, result, preview, onRetry, onClose }) {
  const wrong = items.filter((item) => !result.results[item.id]?.correct)
  if (!result.passed) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <CircleX className="mt-0.5 size-6 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">
              {items.length - wrong.length} dari {items.length} jawaban benar.
            </p>
            <p className="mt-1">
              Soal nomor {wrong.map((item) => items.indexOf(item) + 1).join(', ')} belum tepat.
              Pelajari lagi materinya, lalu ulangi latihan sampai semua benar.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          <Button onClick={onRetry}>
            <RotateCcw className="size-4" aria-hidden="true" /> Ulangi Latihan
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <Alert type="success">
        {preview
          ? 'Semua jawaban benar (pratinjau, tidak disimpan).'
          : 'Hebat! Semua jawaban benar. Sekarang tulis Cerita Reflektif Anda.'}
      </Alert>
      <ol className="space-y-3">
        {items.map((item, number) => (
          <li key={item.id} className="rounded-lg p-3 text-sm ring-1 ring-slate-200">
            <div className="flex items-start gap-2 font-medium text-slate-900">
              <CircleCheck className="size-5 shrink-0 text-brand-600" aria-hidden="true" />
              <span className="shrink-0">{number + 1}.</span>
              <RichText text={item.text} className="min-w-0 flex-1" />
            </div>
            {result.results[item.id]?.explanation && (
              <p className="mt-2 rounded-lg bg-brand-50 p-2 text-xs text-brand-900">
                {result.results[item.id].explanation}
              </p>
            )}
          </li>
        ))}
      </ol>
      <div className="flex justify-end">
        <Button onClick={onClose}>Selesai</Button>
      </div>
    </div>
  )
}

/**
 * Latihan Pemahaman satu materi, satu soal per layar ("Soal 1 dari N" + tombol Jawab). Jawaban
 * diperiksa server setelah soal terakhir; harus benar semua, boleh diulang (urutan pilihan diacak
 * lagi). Siswa: `onPassed(materiTerbaru)` setelah lulus. Guru (`preview`): mencoba tanpa menyimpan.
 */
export default function PracticeQuiz({ material, preview = false, onPassed, onClose }) {
  const quiz = useFetch(materialsApi.practice, material.id)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const items = quiz.data?.items ?? []
  const item = items[step]
  const isLast = step === items.length - 1
  const answered = item && isSubComplete(item, answers[item.id])

  const retry = () => {
    setAnswers({})
    setResult(null)
    setStep(0)
    // Soal diambil ulang agar urutan pilihan diacak lagi.
    quiz.reload()
  }

  const answer = async () => {
    if (!isLast) {
      setStep(step + 1)
      return
    }
    setBusy(true)
    setError('')
    try {
      const data = await materialsApi.submitPractice(material.id, answers)
      setResult(data)
      if (data.passed && data.material) onPassed?.(data.material)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  let body
  if (quiz.error) body = <Alert type="error">{quiz.error}</Alert>
  else if (!quiz.data || quiz.loading) {
    body = (
      <div className="py-12 text-center text-brand-600">
        <Spinner className="size-8" />
      </div>
    )
  } else if (result) {
    body = (
      <ResultView
        items={items}
        result={result}
        preview={preview}
        onRetry={retry}
        onClose={onClose}
      />
    )
  } else {
    body = (
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Soal {step + 1} dari {items.length}
          </p>
          <StepBar total={items.length} current={step} />
        </div>
        <RichText text={item.text} className="text-base font-semibold text-slate-900" />
        <CheckpointQuestion
          checkpoint={item}
          value={answers[item.id]}
          onChange={(value) => setAnswers({ ...answers, [item.id]: value })}
        />
        <Alert type="error">{error}</Alert>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Sebelumnya
          </Button>
          <Button onClick={answer} loading={busy} disabled={!answered} className="min-w-40">
            Jawab
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Modal
      open
      size="lg"
      title={`${preview ? 'Pratinjau ' : ''}Latihan Pemahaman: ${material.title}`}
      onClose={onClose}
    >
      {body}
    </Modal>
  )
}
