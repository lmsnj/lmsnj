import { BarChart3, EyeOff, QrCode } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { qrQuizApi } from '../../api/qrQuiz'
import { schoolSettingsApi } from '../../api/schoolSettings'
import RichText from '../../components/RichText'
import PresentationFrame from '../../components/presentation/PresentationFrame'
import PresentationStatus from '../../components/presentation/PresentationStatus'
import useFetch from '../../hooks/useFetch'
import usePresentationBack from '../../hooks/usePresentationBack'
import useQuizSession from '../../hooks/useQuizSession'
import { getErrorMessage } from '../../utils/errors'
import { moveSlide } from '../../utils/presentation'
import { LETTERS, rosterStatus, tally } from '../../utils/qrQuiz'

const loadSettings = ({ classroom, subject }) => schoolSettingsApi.effective({ classroom, subject })

// Grafik jawaban tanpa nama: satu batang per pilihan, jawaban benar hijau.
function Chart({ question, counts, total, dark }) {
  return (
    <div className="mt-8 space-y-3" aria-label="Grafik jawaban">
      {question.choices.map((choice, index) => {
        const count = counts[index] ?? 0
        const percent = total ? Math.round((count * 100) / total) : 0
        const right = index === question.correct
        return (
          <div key={index} className="flex items-center gap-4 text-2xl">
            <span
              className={`flex size-12 shrink-0 items-center justify-center rounded-lg font-bold ${
                right ? 'bg-brand-600 text-white' : dark ? 'bg-slate-700' : 'bg-slate-200'
              }`}
            >
              {LETTERS[index]}
            </span>
            <div
              className={`h-12 flex-1 overflow-hidden rounded-lg ${dark ? 'bg-slate-800' : 'bg-slate-100'}`}
            >
              <div
                className={`h-full rounded-lg transition-all duration-500 ${right ? 'bg-brand-500' : 'bg-slate-400'}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="w-36 text-right font-semibold tabular-nums">
              {count} ({percent}%)
            </span>
          </div>
        )
      })}
    </div>
  )
}

function QuestionSlide({ session, dark, onToggle }) {
  const index = session.current_question
  const question = session.questions[index]
  const { counts, total } = tally(session.answers, index, question.choices.length)
  const roster = rosterStatus(session.roster, session.answers, index)
  const showChart = session.revealed && session.options.show_chart
  const muted = dark ? 'text-slate-300' : 'text-slate-600'

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col justify-center px-8 py-10">
      <p className={`text-lg font-semibold ${dark ? 'text-brand-300' : 'text-brand-700'}`}>
        {session.title} • Soal {index + 1} dari {session.questions.length}
      </p>
      <RichText text={question.text} className="mt-3 text-4xl leading-snug font-bold" />
      {showChart ? (
        <Chart question={question} counts={counts} total={total} dark={dark} />
      ) : (
        <ul className="mt-8 grid gap-4 text-3xl md:grid-cols-2">
          {question.choices.map((choice, choiceIndex) => (
            <li
              key={choiceIndex}
              className={`flex items-start gap-4 rounded-xl p-4 ring-1 ${dark ? 'ring-slate-700' : 'ring-slate-200'}`}
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">
                {LETTERS[choiceIndex]}
              </span>
              <RichText text={choice} className="min-w-0 pt-1" />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <p className={`flex items-center gap-2 text-2xl font-semibold ${muted}`} aria-live="polite">
          <QrCode className="size-7" aria-hidden="true" />
          {roster.read} / {roster.total} kartu terbaca
        </p>
        {session.options.show_chart && (
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-lg font-semibold text-white hover:bg-brand-700"
          >
            {session.revealed ? (
              <>
                <EyeOff className="size-5" aria-hidden="true" /> Sembunyikan hasil
              </>
            ) : (
              <>
                <BarChart3 className="size-5" aria-hidden="true" /> Tampilkan hasil
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

function Screen({ live, settings }) {
  const back = usePresentationBack()
  const { session, setSession } = live
  const count = session.questions.length
  const control = (data) =>
    qrQuizApi
      .control(session.id, data)
      .then(setSession)
      .catch((err) => window.alert(getErrorMessage(err)))
  const onAction = (action) => {
    const next = moveSlide(session.current_question, action, count)
    if (next !== session.current_question) control({ question: next })
  }

  return (
    <PresentationFrame
      title={session.title}
      subtitle={[session.subject_name, session.classroom_name, 'Kuis Kartu QR'].join(' • ')}
      settings={settings.values}
      counter={`${session.current_question + 1} / ${count}`}
      canPrev={session.current_question > 0}
      canNext={session.current_question < count - 1}
      onAction={onAction}
      onBack={back}
    >
      {({ dark }) =>
        session.finished_at ? (
          <div className="flex min-h-full items-center justify-center p-8 text-center text-4xl font-bold">
            Kuis selesai. Terima kasih!
          </div>
        ) : (
          <QuestionSlide
            session={session}
            dark={dark}
            onToggle={() => control({ revealed: !session.revealed })}
          />
        )
      }
    </PresentationFrame>
  )
}

function WithSettings({ live }) {
  const { classroom, subject } = live.session
  const settings = useFetch(loadSettings, { classroom, subject })
  if (!settings.data) return <PresentationStatus error={settings.error} />
  if (!settings.data.features.kuis_qr) {
    return (
      <PresentationStatus
        featureOff
        featureMessage="Kuis Kartu QR belum diaktifkan untuk sekolah ini."
      />
    )
  }
  return <Screen live={live} settings={settings.data} />
}

/** /kuis-qr/:id/layar — soal & grafik jawaban di TV kelas; dikendalikan dari HP pemindai. */
export default function QrQuizScreenPage() {
  const { id } = useParams()
  const live = useQuizSession(id)
  if (!live.session) return <PresentationStatus error={live.error} />
  return <WithSettings live={live} />
}
