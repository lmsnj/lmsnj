import { Check, X } from 'lucide-react'
import { choiceLetter, questionDir } from '../utils/assessments'
import { categoryLabels } from '../utils/exam'
import { ChoiceContent } from './QuestionContent'

/**
 * Pilihan jawaban + kunci + jawaban siswa, untuk pilihan ganda, PG kompleks, dan kategori.
 * Dipakai di editor guru, pratinjau impor, penilaian guru, dan hasil siswa.
 * - `answer`: jawaban siswa ({ choice, choices }) atau undefined (tanpa jawaban, mis. di editor)
 * - `showKey`: tampilkan kunci jawaban
 * - `who`: "siswa" / "Anda" untuk label "jawaban ..."
 */
export default function AnswerReview({ question, answer, showKey = true, who, imageNames }) {
  if (question.kind === 'essay') return null
  if (question.kind === 'category') {
    return <CategoryReview question={question} answer={answer} showKey={showKey} who={who} />
  }
  const multiple = question.kind === 'multiple'
  const isKey = (i) =>
    multiple ? Boolean(question.correct_choices?.includes(i)) : question.correct_choice === i
  const isChosen = (i) =>
    Boolean(answer) && (multiple ? Boolean(answer.choices?.includes(i)) : answer.choice === i)
  const nothingChosen = answer && !question.choices.some((_, i) => isChosen(i))
  return (
    <ul dir={questionDir(question)} className="space-y-1 text-sm">
      {question.choices.map((_, i) => {
        const correct = showKey && isKey(i)
        const chosen = isChosen(i)
        return (
          <li
            key={i}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${
              correct
                ? 'bg-brand-50 text-brand-800'
                : chosen
                  ? showKey
                    ? 'bg-red-50 text-red-700'
                    : 'bg-slate-100 text-slate-900'
                  : 'text-slate-600'
            }`}
          >
            <span className="font-semibold">{choiceLetter(i)}.</span>
            <ChoiceContent question={question} index={i} imageName={imageNames?.choices?.[i]} />
            {chosen && who && <span className="text-xs font-medium">jawaban {who}</span>}
            {correct && <Check className="size-4 shrink-0" aria-label="jawaban benar" />}
            {showKey && chosen && !correct && <X className="size-4 shrink-0" aria-label="salah" />}
          </li>
        )
      })}
      {nothingChosen && <li className="px-3 text-xs text-slate-500">Tidak dijawab.</li>}
    </ul>
  )
}

function CategoryReview({ question, answer, showKey, who }) {
  const labels = categoryLabels(question)
  return (
    <div className="overflow-x-auto">
      <table dir={questionDir(question)} className="w-full min-w-[24rem] border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-slate-600">
            <th className="border border-slate-200 px-3 py-1.5 text-start font-medium">
              Pernyataan
            </th>
            {labels.map((label) => (
              <th key={label} className="w-28 border border-slate-200 px-2 py-1.5 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {question.choices.map((_, s) => (
            <tr key={s}>
              <td className="border border-slate-200 px-3 py-1.5 text-slate-700">
                <ChoiceContent question={question} index={s} />
              </td>
              {labels.map((label, l) => {
                const correct = showKey && question.correct_choices?.[s] === l
                const chosen = answer?.choices?.[s] === l
                return (
                  <td
                    key={label}
                    className={`border border-slate-200 px-2 py-1.5 text-center ${
                      correct
                        ? 'bg-brand-50 text-brand-800'
                        : chosen && showKey
                          ? 'bg-red-50 text-red-700'
                          : ''
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {correct && <Check className="size-4" aria-label="jawaban benar" />}
                      {chosen && (
                        <span className="text-xs font-medium">
                          {who ? `jawaban ${who}` : 'dipilih'}
                        </span>
                      )}
                      {chosen && showKey && !correct && <X className="size-4" aria-label="salah" />}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {answer && !answer.choices?.some((c) => c !== null && c !== undefined) && (
        <p className="mt-1 px-1 text-xs text-slate-500">Tidak dijawab.</p>
      )}
    </div>
  )
}
