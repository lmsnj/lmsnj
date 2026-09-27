import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { questionsApi } from '../../api/assessments'
import Button from '../../components/Button'
import FormModal from '../../components/FormModal'
import TextAreaField from '../../components/TextAreaField'
import TextField from '../../components/TextField'
import useFormSubmit from '../../hooks/useFormSubmit'
import { choiceLetter, QUESTION_KINDS } from '../../utils/assessments'
import { inputClass } from '../../components/TextField'

const MAX_CHOICES = 6

// Tambah/ubah satu soal. `kind` = 'choice' (pilihan ganda) atau 'essay'.
export default function QuestionFormModal({
  question,
  assessmentId,
  kind,
  nextOrder,
  onClose,
  onSaved,
}) {
  const questionKind = question?.kind ?? kind
  const [form, setForm] = useState({
    text: question?.text ?? '',
    points: question?.points ?? (questionKind === 'choice' ? 1 : 5),
    choices: question?.choices?.length ? question.choices : ['', '', '', ''],
    correct_choice: question?.correct_choice ?? null,
  })

  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const data = { kind: questionKind, text: form.text, points: Number(form.points) }
    if (questionKind === 'choice') {
      data.choices = form.choices
      data.correct_choice = form.correct_choice
    }
    const saved = question
      ? await questionsApi.update(question.id, data)
      : await questionsApi.create({ ...data, assessment: assessmentId, order: nextOrder })
    onSaved(saved)
  })

  const setChoice = (index, value) => {
    const choices = [...form.choices]
    choices[index] = value
    setForm({ ...form, choices })
  }

  const removeChoice = (index) => {
    const choices = form.choices.filter((_, i) => i !== index)
    let correct = form.correct_choice
    if (correct === index) correct = null
    else if (correct !== null && correct > index) correct -= 1
    setForm({ ...form, choices, correct_choice: correct })
  }

  return (
    <FormModal
      title={`${question ? 'Ubah' : 'Tambah'} Soal ${QUESTION_KINDS[questionKind]}`}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError}
    >
      <TextAreaField
        label="Pertanyaan"
        value={form.text}
        onChange={(event) => setForm({ ...form, text: event.target.value })}
        error={errors.text}
        rows={3}
        required
      />
      <TextField
        label="Poin"
        type="number"
        min={1}
        max={100}
        value={form.points}
        onChange={(event) => setForm({ ...form, points: event.target.value })}
        error={errors.points}
        className="w-32"
        required
      />

      {questionKind === 'choice' && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">
            Pilihan jawaban — klik lingkaran untuk menandai jawaban benar
          </legend>
          <div className="space-y-2">
            {form.choices.map((choice, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct"
                  checked={form.correct_choice === index}
                  onChange={() => setForm({ ...form, correct_choice: index })}
                  className="size-4 text-brand-600"
                  aria-label={`Tandai pilihan ${choiceLetter(index)} sebagai jawaban benar`}
                />
                <span className="w-5 text-sm font-semibold text-slate-500">
                  {choiceLetter(index)}.
                </span>
                <input
                  value={choice}
                  onChange={(event) => setChoice(index, event.target.value)}
                  className={`${inputClass} ${form.correct_choice === index ? 'ring-brand-600' : 'ring-slate-300'}`}
                  aria-label={`Pilihan ${choiceLetter(index)}`}
                  required
                />
                <button
                  type="button"
                  onClick={() => removeChoice(index)}
                  disabled={form.choices.length <= 2}
                  className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  aria-label={`Hapus pilihan ${choiceLetter(index)}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          {form.choices.length < MAX_CHOICES && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setForm({ ...form, choices: [...form.choices, ''] })}
            >
              <Plus className="size-4" aria-hidden="true" /> Tambah pilihan
            </Button>
          )}
          {(errors.choices || errors.correct_choice) && (
            <p className="mt-1 text-xs text-red-600">{errors.choices || errors.correct_choice}</p>
          )}
        </fieldset>
      )}
      {questionKind === 'essay' && (
        <p className="text-xs text-slate-500">
          Jawaban esai dinilai manual oleh guru di tab Hasil. Esai yang dibiarkan kosong otomatis
          bernilai 0.
        </p>
      )}
    </FormModal>
  )
}
