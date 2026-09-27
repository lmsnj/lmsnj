import { Clock, Maximize, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { assessmentsApi } from '../../api/assessments'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import useExamGuard, {
  enterFullscreen,
  exitFullscreen,
  fullscreenSupported,
} from '../../hooks/useExamGuard'
import { choiceLetter, formatCountdown } from '../../utils/assessments'
import { getErrorMessage } from '../../utils/errors'

const DRAFT_SYNC_MS = 1500

const VIOLATION_TEXT = {
  hidden: 'pindah tab atau membuka aplikasi lain',
  blur: 'membuka jendela lain',
  fullscreen_exit: 'keluar dari layar penuh',
  navigate: 'mencoba meninggalkan halaman ujian',
}

// Salinan jawaban di perangkat, agar tidak hilang saat halaman ter-refresh atau sinyal putus.
const draftKey = (attemptId) => `lms-asesmen-${attemptId}`

function initialAnswers(attemptId, serverDraft) {
  try {
    const local = JSON.parse(localStorage.getItem(draftKey(attemptId)))
    if (local && Object.keys(local).length) return local
  } catch {
    // abaikan penyimpanan perangkat yang rusak/nonaktif
  }
  // Pindah perangkat / cache terhapus: pulihkan dari jawaban sementara di server.
  return Object.fromEntries(
    (serverDraft ?? []).map((item) => [item.question, item.choice ?? item.text ?? '']),
  )
}

function toPayload(questions, answers) {
  return questions.map((q) =>
    q.kind === 'choice'
      ? { question: q.id, choice: answers[q.id] ?? null }
      : { question: q.id, text: answers[q.id] ?? '' },
  )
}

function clearLocalDraft(attemptId) {
  try {
    localStorage.removeItem(draftKey(attemptId))
  } catch {
    // abaikan
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

  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-lg font-bold ${
        remaining < 5 * 60 * 1000 ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-800'
      }`}
      role="timer"
      aria-live="off"
    >
      <Clock className="size-5" aria-hidden="true" />
      {formatCountdown(remaining)}
    </div>
  )
}

/**
 * Mode ujian: tampil menutupi seluruh aplikasi (menu disembunyikan), diawasi useExamGuard.
 * `onSubmitted(result)` dipanggil setelah dikumpulkan (manual, waktu habis, atau otomatis).
 */
export default function TakeAssessment({ assessment, data, onSubmitted }) {
  const attempt = data.attempt
  const questions = data.questions
  const rules = data.rules ?? { max_violations: 0, require_fullscreen: false }
  const needFullscreen = rules.require_fullscreen && fullscreenSupported()

  const [answers, setAnswers] = useState(() => initialAnswers(attempt.id, data.draft))
  const [violations, setViolations] = useState(attempt.violation_count ?? 0)
  const [warning, setWarning] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement))
  // Selisih jam perangkat dengan jam server, agar timer tidak tertipu jam HP yang salah.
  const [clockOffset] = useState(() => new Date(data.server_time).getTime() - Date.now())

  const answersRef = useRef(answers)
  useEffect(() => {
    answersRef.current = answers
    try {
      localStorage.setItem(draftKey(attempt.id), JSON.stringify(answers))
    } catch {
      // penyimpanan perangkat penuh/nonaktif: jawaban tetap tersimpan di server
    }
    // Simpan juga ke server (dipakai jika jawaban dikumpulkan otomatis atau pindah perangkat).
    const timer = setTimeout(() => {
      assessmentsApi.saveDraft(assessment.id, toPayload(questions, answers)).catch(() => {})
    }, DRAFT_SYNC_MS)
    return () => clearTimeout(timer)
  }, [answers, attempt.id, assessment.id, questions])

  useEffect(() => {
    const update = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  const finish = useCallback(
    (result) => {
      setFinished(true)
      clearLocalDraft(attempt.id)
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
        await assessmentsApi.saveDraft(assessment.id, toPayload(questions, answersRef.current))
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

  const setAnswer = (questionId, value) =>
    setAnswers((current) => ({ ...current, [questionId]: value }))
  const unanswered = questions.filter((q) =>
    q.kind === 'choice'
      ? answers[q.id] === undefined || answers[q.id] === null
      : !String(answers[q.id] ?? '').trim(),
  ).length
  const limit = rules.max_violations

  return (
    // Mode ujian: menutupi header & menu aplikasi agar tidak bisa berpindah halaman.
    <div
      className="fixed inset-0 z-40 overflow-y-auto bg-surface"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{assessment.title}</p>
            <p className="text-xs text-slate-500">
              {questions.length - unanswered}/{questions.length} terjawab · tersimpan otomatis
              {violations > 0 && (
                <span className="font-semibold text-red-600">
                  {' '}
                  · keluar halaman {violations}
                  {limit ? `/${limit}` : '×'}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Countdown deadline={attempt.deadline} clockOffset={clockOffset} onExpire={submit} />
            <Button loading={submitting} onClick={() => setConfirming(true)}>
              Kumpulkan
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-5">
        <Alert type="info" className="mb-4">
          <ShieldAlert className="mr-1 inline size-4" aria-hidden="true" />
          Mode ujian aktif: pindah tab, membuka aplikasi lain
          {needFullscreen ? ', atau keluar dari layar penuh' : ''} akan dicatat dan dilihat guru.
          {limit > 0 && ` Setelah ${limit} kali, jawaban otomatis dikumpulkan.`}
        </Alert>
        <Alert type="error" className="mb-4">
          {error}
        </Alert>

        <ol className="space-y-4 select-none">
          {questions.map((q, index) => (
            <li
              key={q.id}
              className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <p className="font-medium text-slate-900">
                  {index + 1}. <span className="whitespace-pre-line">{q.text}</span>
                </p>
                <span className="shrink-0 text-xs text-slate-500">{q.points} poin</span>
              </div>
              {q.kind === 'choice' ? (
                <div
                  className="space-y-2"
                  role="radiogroup"
                  aria-label={`Pilihan soal ${index + 1}`}
                >
                  {q.choices.map((choice, i) => (
                    <label
                      key={i}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 ring-1 ${
                        answers[q.id] === i
                          ? 'bg-brand-50 ring-brand-600'
                          : 'ring-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={answers[q.id] === i}
                        onChange={() => setAnswer(q.id, i)}
                        className="size-4 text-brand-600"
                      />
                      <span className="font-semibold text-slate-500">{choiceLetter(i)}.</span>
                      <span className="text-slate-800">{choice}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  value={answers[q.id] ?? ''}
                  onChange={(event) => setAnswer(q.id, event.target.value)}
                  rows={5}
                  placeholder="Tulis jawaban Anda..."
                  aria-label={`Jawaban soal ${index + 1}`}
                  className="block w-full rounded-lg border-0 px-3 py-2 text-base ring-1 ring-slate-300 ring-inset select-text focus:ring-2 focus:ring-brand-600 sm:text-sm"
                />
              )}
            </li>
          ))}
        </ol>
        <div className="mt-6 text-center">
          <Button loading={submitting} onClick={() => setConfirming(true)}>
            Kumpulkan Jawaban
          </Button>
        </div>
      </div>

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
        title="Kumpulkan Asesmen?"
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
        <p className="text-sm text-slate-600">
          {unanswered > 0 ? (
            <>
              Masih ada <strong className="text-red-600">{unanswered} soal belum dijawab</strong>
              .{' '}
            </>
          ) : (
            'Semua soal sudah dijawab. '
          )}
          Setelah dikumpulkan, jawaban tidak bisa diubah lagi.
        </p>
      </Modal>
    </div>
  )
}
