import { choiceLetter } from '../../utils/assessments'
import RichText from '../RichText'
import DragDropInput from './DragDropInput'
import FillBlankInput from './FillBlankInput'
import MatchingInput from './MatchingInput'
import ReviewMark from './ReviewMark'

const INPUTS = { fill_blank: FillBlankInput, drag_drop: DragDropInput, matching: MatchingInput }

// Sub-soal pilihan ganda (satu jawaban) di checkpoint video.
function ChoiceList({ checkpoint, value, onChange, dir, review }) {
  const readOnly = !onChange
  const keyChoice = review?.key?.correct_choice
  const chosen = review?.keyOnly ? keyChoice : value?.choice
  return (
    <div role="radiogroup" aria-label="Pilihan jawaban" dir={dir} className="space-y-2">
      {checkpoint.choices.map((choice, index) => {
        const selected = chosen === index
        const isKey = Number.isInteger(keyChoice) && keyChoice === index
        const tone = isKey
          ? 'border-brand-600 bg-brand-50'
          : selected && review?.key
            ? 'border-red-400 bg-red-50'
            : selected
              ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
              : 'border-slate-300 bg-white hover:border-slate-500'
        return (
          <button
            key={index}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={readOnly}
            onClick={() => onChange({ choice: index })}
            className={`flex w-full items-start gap-3 rounded-xl border p-3 text-start transition disabled:cursor-default ${tone}`}
          >
            <span
              className={`flex size-[1.8em] shrink-0 items-center justify-center rounded-full border-2 font-bold ${
                selected && review?.key && !isKey
                  ? 'border-red-500 bg-red-500 text-white'
                  : selected
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300'
              }`}
              aria-hidden="true"
            >
              {choiceLetter(index)}
            </span>
            <RichText text={choice} dir={dir} as="span" className="min-w-0 flex-1 pt-[0.1em]" />
            {review && selected && !review.keyOnly && <ReviewMark correct={review.result} />}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Isi satu checkpoint video: pilihan ganda, isian singkat, tarik & lepas, atau menjodohkan.
 * `checkpoint` berisi isi sub-soal (choices / parts / options / left-right) seperti soal biasa.
 */
export default function CheckpointQuestion({ checkpoint, value, onChange, dir, review }) {
  if (checkpoint.kind === 'choice') {
    return (
      <ChoiceList
        checkpoint={checkpoint}
        value={value}
        onChange={onChange}
        dir={dir}
        review={review}
      />
    )
  }
  const Input = INPUTS[checkpoint.kind]
  return Input ? (
    <Input content={checkpoint} value={value} onChange={onChange} dir={dir} review={review} />
  ) : null
}
