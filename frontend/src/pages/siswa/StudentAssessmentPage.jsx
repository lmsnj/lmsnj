import { Check, ShieldAlert, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { assessmentsApi } from '../../api/assessments'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import { enterFullscreen, fullscreenSupported } from '../../hooks/useExamGuard'
import useFetch from '../../hooks/useFetch'
import { choiceLetter, studentAssessmentStatus } from '../../utils/assessments'
import { getErrorMessage } from '../../utils/errors'
import { formatDate } from '../../utils/media'
import { formatScore } from '../../utils/tasks'
import TakeAssessment from './TakeAssessment'

function ResultView({ assessment, data }) {
  const attempt = data.attempt
  return (
    <>
      {attempt.auto_submitted && (
        <Alert type="error" className="mb-4">
          Jawaban dikumpulkan otomatis oleh sistem karena Anda keluar dari halaman ujian{' '}
          {attempt.violation_count} kali.
        </Alert>
      )}
      <section className="mb-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        {attempt.score !== null ? (
          <>
            <p className="text-xs font-medium text-brand-800 uppercase">Nilai</p>
            <p className="text-4xl font-bold text-brand-700">
              {formatScore(attempt.score)}
              <span className="text-lg font-normal text-slate-500">/{assessment.max_score}</span>
            </p>
          </>
        ) : (
          <>
            <p className="font-medium text-slate-900">Jawaban sudah dikumpulkan.</p>
            <p className="text-sm text-slate-600">
              Nilai pilihan ganda: <strong>{formatScore(attempt.auto_score)}</strong>. Nilai akhir
              muncul setelah guru menilai {attempt.ungraded} jawaban esai.
            </p>
          </>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Dikumpulkan {formatDate(attempt.submitted_at)}
          {attempt.is_late && <span className="text-amber-700"> · melewati batas waktu</span>}
          {attempt.violation_count > 0 && (
            <span className="text-red-600"> · keluar halaman {attempt.violation_count}×</span>
          )}
        </p>
        {!data.answers_revealed && assessment.show_answers && (
          <p className="mt-2 text-xs text-slate-500">
            Kunci jawaban ditampilkan setelah tenggat lewat.
          </p>
        )}
      </section>

      <ol className="space-y-3">
        {data.questions.map((q, index) => {
          const answer = q.answer
          const revealed = q.correct_choice !== null
          return (
            <li key={q.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="mb-2 flex items-start justify-between gap-3">
                <p className="font-medium text-slate-900">
                  {index + 1}. <span className="whitespace-pre-line">{q.text}</span>
                </p>
                <span className="shrink-0 text-sm font-semibold text-slate-700">
                  {answer?.points === null || answer?.points === undefined
                    ? '…'
                    : formatScore(answer.points)}
                  <span className="font-normal text-slate-500">/{q.points}</span>
                </span>
              </div>
              {q.kind === 'choice' ? (
                <ul className="space-y-1 text-sm">
                  {q.choices.map((choice, i) => {
                    const chosen = answer?.choice === i
                    const correct = revealed && i === q.correct_choice
                    return (
                      <li
                        key={i}
                        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${
                          correct
                            ? 'bg-brand-50 text-brand-800'
                            : chosen
                              ? 'bg-slate-100 text-slate-900'
                              : 'text-slate-600'
                        }`}
                      >
                        <span className="font-semibold">{choiceLetter(i)}.</span>
                        <span className="flex-1">{choice}</span>
                        {chosen && <span className="text-xs font-medium">jawaban Anda</span>}
                        {correct && <Check className="size-4" aria-label="jawaban benar" />}
                        {revealed && chosen && !correct && (
                          <X className="size-4 text-red-600" aria-label="salah" />
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap text-slate-800 ring-1 ring-slate-200">
                  {answer?.text || <span className="text-slate-400">(tidak dijawab)</span>}
                </div>
              )}
              {answer?.feedback && (
                <p className="mt-2 text-sm text-slate-700">
                  <span className="font-medium">Umpan balik guru:</span> {answer.feedback}
                </p>
              )}
            </li>
          )
        })}
      </ol>
    </>
  )
}

export default function StudentAssessmentPage() {
  const { id } = useParams()
  const assessment = useFetch(assessmentsApi.get, id)
  const [session, setSession] = useState(null) // hasil start/my-attempt/submit
  const [starting, setStarting] = useState(false)
  const [confirmStart, setConfirmStart] = useState(false)
  const [error, setError] = useState('')

  // Lanjutkan pengerjaan yang sudah dimulai / tampilkan hasil yang sudah dikumpulkan.
  const status = assessment.data?.my_attempt?.status
  useEffect(() => {
    if (!status) return
    let ignore = false
    assessmentsApi
      .myAttempt(id)
      .then((data) => !ignore && setSession(data))
      .catch((err) => !ignore && setError(getErrorMessage(err)))
    return () => {
      ignore = true
    }
  }, [id, status])

  const start = async () => {
    if (assessment.data?.require_fullscreen) enterFullscreen()
    setStarting(true)
    setError('')
    try {
      setSession(await assessmentsApi.start(id))
      setConfirmStart(false)
    } catch (err) {
      setError(getErrorMessage(err))
      setConfirmStart(false)
    } finally {
      setStarting(false)
    }
  }

  const handleSubmitted = useCallback(
    (result) => {
      setSession(result)
      assessment.reload()
      window.scrollTo({ top: 0 })
    },
    [assessment],
  )

  if (assessment.error) {
    return (
      <Alert type="error">
        {assessment.error}{' '}
        <Link to="/siswa/asesmen" className="font-medium underline">
          Kembali
        </Link>
      </Alert>
    )
  }
  if (!assessment.data || (status && !session && !error)) {
    return (
      <div className="py-10 text-center text-brand-600">
        <Spinner />
      </div>
    )
  }

  const a = assessment.data
  const current = session?.attempt
  const badge = studentAssessmentStatus(a)
  return (
    <>
      <Link
        to="/siswa/asesmen"
        className="mb-2 inline-block text-sm text-brand-700 hover:underline"
      >
        ← Lembar asesmen
      </Link>
      <PageHeader
        title={a.title}
        description={`${a.subject_name} · tenggat ${formatDate(a.due_at)}`}
      />
      <Alert type="error" className="mb-4">
        {error}
      </Alert>

      {current?.status === 'in_progress' ? (
        <TakeAssessment assessment={a} data={session} onSubmitted={handleSubmitted} />
      ) : current ? (
        <ResultView assessment={a} data={session} />
      ) : (
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <Badge color={badge.color}>{badge.label}</Badge>
          {a.instructions && (
            <p className="mt-3 whitespace-pre-line text-slate-700">{a.instructions}</p>
          )}
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Jumlah soal</dt>
              <dd className="font-medium text-slate-900">
                {a.question_count} soal ({a.max_score} poin)
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Waktu mengerjakan</dt>
              <dd className="font-medium text-slate-900">
                {a.duration_minutes
                  ? `${a.duration_minutes} menit`
                  : 'Tanpa batas (sampai tenggat)'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Tenggat</dt>
              <dd className="font-medium text-slate-900">{formatDate(a.due_at)}</dd>
            </div>
          </dl>
          {a.is_past_due ? (
            <Alert type="error" className="mt-4">
              Tenggat sudah lewat, asesmen ini tidak bisa dikerjakan lagi.
            </Alert>
          ) : (
            <Button className="mt-5" onClick={() => setConfirmStart(true)}>
              Mulai Kerjakan
            </Button>
          )}
        </section>
      )}

      <Modal
        open={confirmStart}
        title="Mulai mengerjakan?"
        onClose={() => setConfirmStart(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmStart(false)}>
              Nanti Saja
            </Button>
            <Button loading={starting} onClick={start}>
              Mulai Sekarang
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            {a.duration_minutes
              ? `Waktu ${a.duration_minutes} menit langsung berjalan dan tidak bisa dijeda. `
              : ''}
            Asesmen hanya bisa dikerjakan <strong>satu kali</strong>. Jawaban tersimpan otomatis
            sampai Anda menekan Kumpulkan.
          </p>
          <div className="rounded-lg bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200">
            <p className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="size-4" aria-hidden="true" /> Mode ujian diawasi
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>Menu aplikasi disembunyikan sampai Anda selesai.</li>
              <li>
                Pindah tab, membuka aplikasi lain, atau menutup halaman akan dicatat dan dilihat
                guru.
              </li>
              {a.require_fullscreen && fullscreenSupported() && (
                <li>Wajib layar penuh; keluar dari layar penuh dihitung pelanggaran.</li>
              )}
              {a.max_violations > 0 && (
                <li>
                  Setelah <strong>{a.max_violations} kali</strong> keluar, jawaban otomatis
                  dikumpulkan.
                </li>
              )}
            </ul>
          </div>
        </div>
      </Modal>
    </>
  )
}
