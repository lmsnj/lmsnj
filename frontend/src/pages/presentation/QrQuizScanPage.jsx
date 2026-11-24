import {
  ArrowLeft,
  BarChart3,
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  EyeOff,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { qrQuizApi } from '../../api/qrQuiz'
import { schoolSettingsApi } from '../../api/schoolSettings'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import RichText from '../../components/RichText'
import PresentationStatus from '../../components/presentation/PresentationStatus'
import useFetch from '../../hooks/useFetch'
import usePresentationBack from '../../hooks/usePresentationBack'
import useQuizSession from '../../hooks/useQuizSession'
import { getErrorMessage } from '../../utils/errors'
import { LETTERS, rosterStatus, updateStreaks } from '../../utils/qrQuiz'

const SCAN_GAP_MS = 150 // jeda antar-gambar agar HP tidak panas

/**
 * Kamera belakang + pembaca QR. Setiap gambar dibaca; kartu yang pilihannya sama di 2 gambar
 * berturut-turut dikirim lewat `onStable([{card, option}])`. `onSeen(n)` = jumlah kartu di gambar.
 */
function CameraScanner({ active, onStable, onSeen }) {
  const videoRef = useRef(null)
  const [error, setError] = useState('')
  const callbacks = useRef({ onStable, onSeen })
  useEffect(() => {
    callbacks.current = { onStable, onSeen }
  })

  useEffect(() => {
    if (!active) return undefined
    let stopped = false
    let stream = null
    let streaks = new Map()
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })

    const loop = async (scanImage) => {
      const video = videoRef.current
      if (stopped || !video) return
      if (video.readyState >= 2 && video.videoWidth) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        context.drawImage(video, 0, 0)
        try {
          const reads = await scanImage(context.getImageData(0, 0, canvas.width, canvas.height))
          const result = updateStreaks(streaks, reads)
          streaks = result.streaks
          callbacks.current.onSeen(reads.length)
          if (result.stable.length) callbacks.current.onStable(result.stable)
        } catch {
          // Satu gambar gagal dibaca: lanjut ke gambar berikutnya.
        }
      }
      if (!stopped) setTimeout(() => loop(scanImage), SCAN_GAP_MS)
    }

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Browser ini tidak bisa membuka kamera. Buka lewat alamat https.')
        }
        // Resolusi tinggi agar kartu kecil di belakang kelas tetap terbaca.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        if (stopped) return
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
        const { scanImage } = await import('../../components/qrQuiz/qrScanner')
        loop(scanImage)
      } catch (err) {
        setError(
          err?.name === 'NotAllowedError'
            ? 'Izin kamera ditolak. Izinkan kamera untuk situs ini di pengaturan browser.'
            : err?.message || 'Kamera tidak bisa dibuka.',
        )
      }
    }
    start()
    return () => {
      stopped = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [active])

  if (!active) return null
  return (
    <div className="space-y-2">
      {error && <Alert type="error">{error}</Alert>}
      <video
        ref={videoRef}
        muted
        playsInline
        className="aspect-video w-full rounded-xl bg-black object-cover"
        aria-label="Gambar kamera"
      />
    </div>
  )
}

function RosterGrid({ rows, pending }) {
  return (
    <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-5" aria-label="Status kartu siswa">
      {rows.map((row) => {
        const waiting = pending.has(row.number)
        const answer = row.answer
        const tone = answer
          ? 'bg-brand-600 text-white ring-brand-600'
          : waiting
            ? 'bg-amber-100 text-amber-900 ring-amber-300'
            : 'bg-white text-slate-600 ring-slate-200'
        return (
          <li key={row.student} className={`rounded-lg px-2 py-1.5 text-xs ring-1 ${tone}`}>
            <span className="flex items-center justify-between gap-1 font-bold">
              #{row.number}
              {answer && <span>{LETTERS[answer.option]}</span>}
            </span>
            <span className="block truncate">{row.full_name}</span>
          </li>
        )
      })}
    </ul>
  )
}

function FinishDialog({ session, onClose, onFinished }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const answered = new Set(session.answers.map((a) => a.student))
  const absent = session.roster.filter((row) => !answered.has(row.student)).length
  const finish = async () => {
    setBusy(true)
    setError('')
    try {
      onFinished(await qrQuizApi.finish(session.id))
    } catch (err) {
      setError(getErrorMessage(err))
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      title="Selesaikan kuis?"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={finish} loading={busy}>
            Selesai & Simpan Nilai
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-700">
        <Alert type="error">{error}</Alert>
        <p>
          Nilai = jumlah benar / {session.questions.length} soal × 100, disimpan ke Penilaian
          Langsung (jenis Kuis QR). Setelah selesai, kartu tidak bisa dipindai lagi.
        </p>
        {absent > 0 && (
          <Alert type="warning">
            {absent} siswa belum terbaca sama sekali dan akan dicatat <b>tidak hadir</b>.
          </Alert>
        )}
      </div>
    </Modal>
  )
}

function reportText(report) {
  const parts = []
  if (report.unknown_cards.length) {
    parts.push(`kartu tanpa pemilik: ${report.unknown_cards.join(', ')}`)
  }
  if (report.invalid_cards.length) {
    parts.push(`pilihan tidak ada di soal ini (kartu ${report.invalid_cards.join(', ')})`)
  }
  if (report.kept_cards.length) {
    parts.push(`sudah terjawab, tidak diganti (kartu ${report.kept_cards.join(', ')})`)
  }
  return parts.length ? `Dilewati: ${parts.join('; ')}.` : ''
}

function Scanner({ live }) {
  const back = usePresentationBack()
  const { session, setSession } = live
  const index = session.current_question
  const question = session.questions[index]
  const [cameraOn, setCameraOn] = useState(false)
  const [seen, setSeen] = useState(0)
  // Bacaan yang belum tersimpan (kartu -> pilihan) + catatan hasil simpan, berlaku untuk satu soal;
  // setelah pindah soal otomatis kosong (dicek lewat `question`, tanpa effect).
  const [scanState, setScanState] = useState({ question: index, cards: new Map(), notice: '' })
  const current = scanState.question === index ? scanState : { cards: new Map(), notice: '' }
  const [error, setError] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [finished, setFinished] = useState(null)
  const sending = useRef(false)
  const queue = useRef({ question: index, cards: new Map() })
  const questionRef = useRef(index)
  useEffect(() => {
    questionRef.current = index
  }, [index])

  // Ubah bacaan soal `question` (bacaan soal lain dibuang).
  const updateScan = useCallback((question, change) => {
    setScanState((state) => {
      const base = state.question === question ? state : { question, cards: new Map(), notice: '' }
      return { ...base, ...change(base) }
    })
  }, [])

  const flush = useCallback(async () => {
    if (sending.current || queue.current.cards.size === 0) return
    sending.current = true
    const { question, cards: batch } = queue.current
    queue.current = { question, cards: new Map() }
    try {
      const scans = [...batch].map(([card, option]) => ({ card, option }))
      const result = await qrQuizApi.scans(session.id, question, scans)
      setSession(result.session)
      updateScan(question, () => ({ notice: reportText(result.report) }))
      setError('')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      sending.current = false
      updateScan(question, (state) => {
        const cards = new Map(state.cards)
        for (const card of batch.keys()) if (!queue.current.cards.has(card)) cards.delete(card)
        return { cards }
      })
      if (queue.current.cards.size) flush()
    }
  }, [session.id, setSession, updateScan])

  const onStable = useCallback(
    (reads) => {
      const question = questionRef.current
      if (queue.current.question !== question) queue.current = { question, cards: new Map() }
      for (const { card, option } of reads) queue.current.cards.set(card, option)
      updateScan(question, (state) => {
        const cards = new Map(state.cards)
        for (const { card, option } of reads) cards.set(card, option)
        return { cards }
      })
      flush()
    },
    [flush, updateScan],
  )

  const control = (data) =>
    qrQuizApi
      .control(session.id, data)
      .then(setSession)
      .catch((err) => setError(getErrorMessage(err)))

  const roster = rosterStatus(session.roster, session.answers, index)

  if (finished || session.finished_at) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <CheckCircle2 className="mx-auto size-14 text-brand-600" aria-hidden="true" />
        <h1 className="text-xl font-bold text-slate-900">Kuis selesai</h1>
        <p className="text-sm text-slate-600">Nilai sudah tersimpan di Penilaian Langsung.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link
            to={`/guru/kelas/${session.teaching_assignment}/penilaian?p=${
              finished?.grade_activity ?? session.grade_activity
            }`}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white"
          >
            <ClipboardCheck className="size-4" aria-hidden="true" /> Lihat Nilai
          </Link>
          <Button variant="secondary" onClick={back}>
            Kembali
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3 pb-24">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={back}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full ring-1 ring-slate-200 hover:bg-slate-100"
          aria-label="Kembali"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-slate-900">{session.title}</h1>
          <p className="text-xs text-slate-500">{session.classroom_name}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            onClick={() => control({ question: index - 1 })}
            disabled={index === 0}
            aria-label="Soal sebelumnya"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <span className="min-w-12 text-center text-sm font-semibold tabular-nums">
            {index + 1}/{session.questions.length}
          </span>
          <Button
            variant="secondary"
            onClick={() => control({ question: index + 1 })}
            disabled={index === session.questions.length - 1}
            aria-label="Soal berikutnya"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <section className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
        <RichText text={question.text} className="text-sm text-slate-800" />
        <p className="mt-1 text-xs text-slate-500">
          Kunci: <b className="text-brand-700">{LETTERS[question.correct]}</b> •{' '}
          {question.choices.length} pilihan
        </p>
      </section>

      <Alert type="error">{error}</Alert>
      {cameraOn ? (
        <CameraScanner active={cameraOn} onStable={onStable} onSeen={setSeen} />
      ) : (
        <button
          type="button"
          onClick={() => setCameraOn(true)}
          className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl bg-slate-900 text-white"
        >
          <Camera className="size-10" aria-hidden="true" />
          <span className="font-semibold">Nyalakan Kamera</span>
          <span className="text-xs text-slate-300">Arahkan ke kartu yang diangkat siswa</span>
        </button>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800" aria-live="polite">
          {roster.read} / {roster.total} terbaca
          {cameraOn && (
            <span className="font-normal text-slate-500"> • {seen} kartu di kamera</span>
          )}
        </p>
        {cameraOn && (
          <Button variant="ghost" size="sm" onClick={() => setCameraOn(false)}>
            <CameraOff className="size-4" aria-hidden="true" /> Matikan kamera
          </Button>
        )}
      </div>
      {current.notice && <Alert type="warning">{current.notice}</Alert>}
      {roster.noCard > 0 && (
        <p className="text-xs text-amber-700">{roster.noCard} siswa belum punya nomor kartu.</p>
      )}
      <RosterGrid rows={roster.rows} pending={current.cards} />

      <div className="fixed inset-x-0 bottom-0 flex flex-wrap justify-center gap-2 border-t border-slate-200 bg-white/95 p-3">
        {session.options.show_chart && (
          <Button variant="secondary" onClick={() => control({ revealed: !session.revealed })}>
            {session.revealed ? (
              <>
                <EyeOff className="size-4" aria-hidden="true" /> Sembunyikan hasil
              </>
            ) : (
              <>
                <BarChart3 className="size-4" aria-hidden="true" /> Tampilkan hasil di TV
              </>
            )}
          </Button>
        )}
        {index < session.questions.length - 1 ? (
          <Button onClick={() => control({ question: index + 1 })}>
            Soal Berikutnya <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button onClick={() => setFinishing(true)}>
            <CheckCircle2 className="size-4" aria-hidden="true" /> Selesai & Simpan Nilai
          </Button>
        )}
      </div>
      {finishing && (
        <FinishDialog
          session={session}
          onClose={() => setFinishing(false)}
          onFinished={(result) => {
            setFinishing(false)
            setCameraOn(false)
            setSession(result.session)
            setFinished(result)
          }}
        />
      )}
    </div>
  )
}

/** /kuis-qr/:id/pindai — HP guru memindai kartu QR siswa (Mapel Umum Tahap 5). */
export default function QrQuizScanPage() {
  const { id } = useParams()
  // Di luar DashboardLayout (tanpa SettingsContext): saklar fitur dibaca sendiri.
  const settings = useFetch(schoolSettingsApi.effective, {})
  const live = useQuizSession(id)
  if (!live.session || !settings.data) {
    return <PresentationStatus error={live.error || settings.error} />
  }
  if (!settings.data.features.kuis_qr) {
    return (
      <PresentationStatus
        featureOff
        featureMessage="Kuis Kartu QR belum diaktifkan untuk sekolah ini."
      />
    )
  }
  return (
    <div className="min-h-screen bg-surface">
      <Scanner live={live} />
    </div>
  )
}
