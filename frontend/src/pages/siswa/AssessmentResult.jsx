import { CircleAlert, CircleCheck, Hourglass, RotateCcw, Trophy } from 'lucide-react'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import { formatPercent, resultDisplay } from '../../utils/assessments'
import { formatDate } from '../../utils/media'
import { formatScore } from '../../utils/tasks'

const TONES = {
  green: { ring: 'bg-brand-50 text-brand-700 ring-brand-200', icon: Trophy },
  amber: { ring: 'bg-amber-50 text-amber-700 ring-amber-200', icon: RotateCcw },
  red: { ring: 'bg-red-50 text-red-600 ring-red-200', icon: CircleAlert },
}

// Lingkaran nilai akhir (skala 100) berwarna sesuai status.
function ScoreCircle({ result, display }) {
  if (result.status === 'pending') {
    return (
      <span className="flex size-28 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-8 ring-amber-100">
        <Hourglass className="size-12" aria-hidden="true" />
      </span>
    )
  }
  const tone = TONES[display.color] ?? TONES.green
  return (
    <span
      className={`flex size-28 flex-col items-center justify-center rounded-full ring-8 ${tone.ring}`}
    >
      <span className="text-4xl font-bold">{formatPercent(result.final_score)}</span>
      <span className="text-xs font-medium">nilai akhir</span>
    </span>
  )
}

// Rincian di bawah lingkaran nilai: KKM, nilai percobaan ini, sisa remedial.
function ResultDetails({ result, attempt, maxScore }) {
  return (
    <dl className="grid grid-cols-2 gap-2 text-left text-sm">
      {result.passing_score !== null && (
        <div className="rounded-lg bg-slate-50 p-2.5">
          <dt className="text-xs text-slate-500">KKM</dt>
          <dd className="font-semibold text-slate-900">{result.passing_score}</dd>
        </div>
      )}
      <div className="rounded-lg bg-slate-50 p-2.5">
        <dt className="text-xs text-slate-500">
          {attempt.number > 1 ? `Nilai remedial ke-${attempt.number - 1}` : 'Skor'}
        </dt>
        <dd className="font-semibold text-slate-900">
          {formatScore(attempt.score ?? attempt.auto_score)}/{maxScore}
          {attempt.score === null && (
            <span className="ml-1 text-xs font-normal text-amber-700">sementara</span>
          )}
        </dd>
      </div>
      {result.status === 'remedial' && (
        <div className="col-span-2 rounded-lg bg-amber-50 p-2.5 text-amber-900">
          <dt className="text-xs">Kesempatan remedial</dt>
          <dd className="font-semibold">
            {result.remedial_left} kali lagi, sampai {formatDate(result.remedial_due_at)}
          </dd>
        </div>
      )}
    </dl>
  )
}

/** Popup hasil yang langsung muncul setelah jawaban dikumpulkan. */
export function ResultDialog({ open, result, attempt, maxScore, onClose, onRemedial }) {
  const display = resultDisplay(result)
  if (!display) return null
  const canRemedial = result.status === 'remedial'
  return (
    <Modal
      open={open}
      title="Hasil Asesmen"
      onClose={onClose}
      footer={
        canRemedial ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Nanti Saja
            </Button>
            <Button onClick={onRemedial}>
              <RotateCcw className="size-4" aria-hidden="true" /> Kerjakan Remedial
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Lihat Pembahasan</Button>
        )
      }
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <ScoreCircle result={result} display={display} />
        <div>
          <Badge color={display.color}>{display.label}</Badge>
          <p className="mt-2 text-lg font-bold text-slate-900">{display.title}</p>
          {display.message && <p className="mt-1 text-sm text-slate-600">{display.message}</p>}
        </div>
        <div className="w-full">
          <ResultDetails result={result} attempt={attempt} maxScore={maxScore} />
        </div>
      </div>
    </Modal>
  )
}

/** Ringkasan hasil di halaman asesmen (selalu terlihat, dengan tombol remedial jika ada). */
export function ResultSummary({ result, attempt, maxScore, onRemedial }) {
  const display = resultDisplay(result)
  if (!display) return null
  const Icon =
    result.status === 'pending' ? Hourglass : display.color === 'green' ? CircleCheck : CircleAlert
  return (
    <section className="mb-4 flex flex-col gap-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-center">
      <ScoreCircle result={result} display={display} />
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <p className="flex items-center gap-2 font-bold text-slate-900">
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            {display.title}
            <Badge color={display.color}>{display.label}</Badge>
          </p>
          {display.message && <p className="mt-1 text-sm text-slate-600">{display.message}</p>}
        </div>
        <ResultDetails result={result} attempt={attempt} maxScore={maxScore} />
        {result.status === 'remedial' && (
          <Button onClick={onRemedial}>
            <RotateCcw className="size-4" aria-hidden="true" /> Kerjakan Remedial
          </Button>
        )}
      </div>
    </section>
  )
}
