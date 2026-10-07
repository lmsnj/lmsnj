import { IdCard, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { assessmentsApi } from '../../api/assessments'
import Alert from '../../components/Alert'
import AnswerReview from '../../components/AnswerReview'
import { QuestionBody } from '../../components/QuestionContent'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import TextField from '../../components/TextField'
import { enterFullscreen, fullscreenSupported } from '../../hooks/useExamGuard'
import useFetch from '../../hooks/useFetch'
import { studentAssessmentStatus } from '../../utils/assessments'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import { sharedStimuli } from '../../utils/exam'
import { formatDate } from '../../utils/media'
import { formatScore } from '../../utils/tasks'
import { ResultDialog, ResultSummary } from './AssessmentResult'
import TakeAssessment from './TakeAssessment'

function ResultView({ assessment, data, onRemedial }) {
  const attempt = data.attempt
  return (
    <>
      {attempt.auto_submitted && (
        <Alert type="error" className="mb-4">
          Jawaban dikumpulkan otomatis oleh sistem karena Anda keluar dari halaman ujian{' '}
          {attempt.violation_count} kali.
        </Alert>
      )}
      <ResultSummary
        result={data.result}
        attempt={attempt}
        maxScore={assessment.max_score}
        onRemedial={onRemedial}
      />
      <section className="mb-4 rounded-xl bg-white px-5 py-3 shadow-sm ring-1 ring-slate-200">
        {attempt.score === null && (
          <p className="text-sm text-slate-600">
            Nilai soal otomatis (pilihan ganda, PG kompleks, kategori):{' '}
            <strong>{formatScore(attempt.auto_score)}</strong>. Nilai akhir muncul setelah guru
            menilai {attempt.ungraded} jawaban esai.
          </p>
        )}
        <p className="text-xs text-slate-500">
          {attempt.number > 1 && `Remedial ke-${attempt.number - 1} · `}
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
        {data.questions.map((q, index, all) => {
          const answer = q.answer
          return (
            <li key={q.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <QuestionBody
                    question={q}
                    number={index + 1}
                    shared={sharedStimuli(all)[index]}
                  />
                </div>
                <span className="shrink-0 text-sm font-semibold text-slate-700">
                  {answer?.points === null || answer?.points === undefined
                    ? '…'
                    : formatScore(answer.points)}
                  <span className="font-normal text-slate-500">/{q.points}</span>
                </span>
              </div>
              {q.kind !== 'essay' ? (
                <AnswerReview
                  question={q}
                  answer={answer ?? {}}
                  showKey={Boolean(q.key_revealed)}
                  who="Anda"
                />
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
  // null = tertutup, 'start' = pengerjaan pertama, 'remedial' = percobaan remedial.
  const [confirmMode, setConfirmMode] = useState(null)
  const [showResult, setShowResult] = useState(false)
  const [error, setError] = useState('')
  const [token, setToken] = useState('')
  const [tokenError, setTokenError] = useState('')

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
    setTokenError('')
    try {
      setSession(await assessmentsApi.start(id, token, confirmMode === 'remedial'))
      setConfirmMode(null)
      setShowResult(false)
    } catch (err) {
      // Token salah: tetap di dialog agar siswa bisa mengetik ulang.
      const fieldError = getFieldErrors(err).token
      if (fieldError) {
        setTokenError(fieldError)
      } else {
        setError(getErrorMessage(err))
        setConfirmMode(null)
      }
    } finally {
      setStarting(false)
    }
  }

  const handleSubmitted = useCallback(
    (result) => {
      setSession(result)
      setShowResult(true) // popup nilai langsung muncul setelah mengumpulkan
      setToken('')
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
        <TakeAssessment
          key={current.id}
          assessment={a}
          data={session}
          onSubmitted={handleSubmitted}
        />
      ) : current ? (
        <ResultView assessment={a} data={session} onRemedial={() => setConfirmMode('remedial')} />
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
          {a.exam_event && (
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">
              <IdCard className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Asesmen ini bagian dari <strong>{a.exam_event_name}</strong>. Siapkan kartu peserta
                ujian Anda: token di kartu diminta saat mulai mengerjakan.
              </span>
            </p>
          )}
          {a.locked_by_material ? (
            <Alert type="info" className="mt-4">
              Masih terkunci. Selesaikan dulu capaian materi &ldquo;{a.locked_by_material}&rdquo; di
              menu Materi.
            </Alert>
          ) : a.is_past_due ? (
            <Alert type="error" className="mt-4">
              Tenggat sudah lewat, asesmen ini tidak bisa dikerjakan lagi.
            </Alert>
          ) : (
            <Button className="mt-5" onClick={() => setConfirmMode('start')}>
              Mulai Kerjakan
            </Button>
          )}
        </section>
      )}

      {session?.result && current?.submitted_at && (
        <ResultDialog
          open={showResult}
          result={session.result}
          attempt={current}
          maxScore={a.max_score}
          onClose={() => setShowResult(false)}
          onRemedial={() => {
            setShowResult(false)
            setConfirmMode('remedial')
          }}
        />
      )}

      <Modal
        open={Boolean(confirmMode)}
        title={confirmMode === 'remedial' ? 'Mulai remedial?' : 'Mulai mengerjakan?'}
        onClose={() => setConfirmMode(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmMode(null)}>
              Nanti Saja
            </Button>
            <Button loading={starting} onClick={start} disabled={a.exam_event && !token.trim()}>
              Mulai Sekarang
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-600">
          {a.exam_event && (
            <TextField
              label="Token kartu peserta ujian"
              value={token}
              onChange={(event) => setToken(event.target.value.toUpperCase())}
              error={tokenError}
              hint="Lihat kotak TOKEN di kartu peserta ujian Anda."
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={10}
              className="font-mono tracking-widest"
            />
          )}
          <p>
            {a.duration_minutes
              ? `Waktu ${a.duration_minutes} menit langsung berjalan dan tidak bisa dijeda. `
              : ''}
            {confirmMode === 'remedial' ? (
              <>
                Soal remedial <strong>sama</strong> dengan sebelumnya. Jika nilai remedial mencapai
                KKM, nilai akhir dicatat sebesar KKM ({a.passing_score}).{' '}
              </>
            ) : (
              <>
                Asesmen dikerjakan <strong>satu kali</strong>
                {a.remedial_attempts > 0 &&
                  ` (jika di bawah KKM ${a.passing_score}, ada ${a.remedial_attempts} kesempatan remedial)`}
                .{' '}
              </>
            )}
            Jawaban tersimpan otomatis sampai Anda menekan Selesai Ujian.
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
