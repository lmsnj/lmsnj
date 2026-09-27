import { ImagePlus, Plus, Sigma, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { questionsApi } from '../../api/assessments'
import AuthImage from '../../components/AuthImage'
import Button from '../../components/Button'
import FormModal from '../../components/FormModal'
import MathFieldDialog from '../../components/MathFieldDialog'
import RichText from '../../components/RichText'
import SelectField from '../../components/SelectField'
import TextAreaField from '../../components/TextAreaField'
import TextField, { inputClass } from '../../components/TextField'
import useFormSubmit from '../../hooks/useFormSubmit'
import { choiceLetter, QUESTION_KINDS } from '../../utils/assessments'
import { insertAt } from '../../utils/richText'

const MAX_CHOICES = 6
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp'

const DIRECTIONS = [
  { value: 'auto', label: 'Otomatis (ikuti huruf pertama)' },
  { value: 'rtl', label: 'Kanan ke kiri (bahasa Arab)' },
  { value: 'ltr', label: 'Kiri ke kanan' },
]

// Contoh isian cepat untuk soal pilihan ganda.
const CHOICE_PRESETS = [
  { label: 'Benar / Salah', apply: () => ({ choices: ['Benar', 'Salah'] }) },
  { label: '4 pilihan (A–D)', apply: () => ({ choices: ['', '', '', ''] }) },
  { label: '5 pilihan (A–E)', apply: () => ({ choices: ['', '', '', '', ''] }) },
  { label: 'Soal bahasa Arab', apply: () => ({ text_direction: 'rtl' }) },
]

// Kunci gambar: 'stimulus', 'question', atau 'choice-<nomor>'.
const imageKey = (slot, index = 0) => (slot === 'choice' ? `choice-${index}` : slot)
const keyToSlot = (key) => (key.startsWith('choice-') ? ['choice', Number(key.slice(7))] : [key, 0])

function existingImages(question) {
  const images = question?.images
  const result = {}
  if (!images) return result
  if (images.stimulus) result.stimulus = images.stimulus
  if (images.question) result.question = images.question
  images.choices?.forEach((image, index) => {
    if (image) result[imageKey('choice', index)] = image
  })
  return result
}

function ImagePicker({ label, current, pending, onPick, onRemove }) {
  const input = useRef(null)
  const name = pending instanceof File ? pending.name : null
  const showCurrent = current && pending !== 'remove' && !name
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files[0]
          if (file) onPick(file)
          event.target.value = ''
        }}
      />
      <Button variant="ghost" size="sm" onClick={() => input.current?.click()} aria-label={label}>
        <ImagePlus className="size-4" aria-hidden="true" />
        {current || name ? 'Ganti gambar' : 'Gambar'}
      </Button>
      {showCurrent && <AuthImage url={current.url} alt={label} className="max-h-16" />}
      {name && <span className="rounded bg-sky-50 px-2 py-0.5 text-xs text-sky-800">🖼 {name}</span>}
      {(showCurrent || name) && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
          aria-label={`Hapus ${label.toLowerCase()}`}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

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
    stimulus: question?.stimulus ?? '',
    text: question?.text ?? '',
    text_direction: question?.text_direction ?? 'auto',
    points: question?.points ?? (questionKind === 'choice' ? 1 : 5),
    choices: question?.choices?.length ? question.choices : ['', '', '', ''],
    correct_choice: question?.correct_choice ?? null,
  })
  const [showStimulus, setShowStimulus] = useState(
    Boolean(question?.stimulus || question?.images?.stimulus),
  )
  const [current] = useState(() => existingImages(question))
  // Perubahan gambar yang disimpan setelah soal tersimpan: File baru, atau 'remove'.
  const [pending, setPending] = useState({})
  const [mathTarget, setMathTarget] = useState(null) // { field, position }
  const fields = useRef({})

  const hasImage = (key) =>
    pending[key] instanceof File || (current[key] && pending[key] !== 'remove')

  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const data = {
      kind: questionKind,
      stimulus: showStimulus ? form.stimulus : '',
      text: form.text,
      text_direction: form.text_direction,
      points: Number(form.points),
    }
    if (questionKind === 'choice') {
      data.choices = form.choices
      data.correct_choice = form.correct_choice
      // Pilihan bergambar boleh tanpa teks.
      data.image_choices = form.choices
        .map((_, i) => i)
        .filter((i) => hasImage(imageKey('choice', i)))
    }
    let saved = question
      ? await questionsApi.update(question.id, data)
      : await questionsApi.create({ ...data, assessment: assessmentId, order: nextOrder })
    for (const [key, change] of Object.entries(pending)) {
      const [slot, index] = keyToSlot(key)
      if (slot === 'choice' && index >= form.choices.length) continue
      if (slot === 'stimulus' && !showStimulus) continue
      if (change === 'remove') await questionsApi.removeImage(saved.id, slot, index)
      else saved = await questionsApi.uploadImage(saved.id, slot, index, change)
    }
    if (!showStimulus && current.stimulus) await questionsApi.removeImage(saved.id, 'stimulus', 0)
    onSaved(saved)
  })

  const update = (changes) => setForm((f) => ({ ...f, ...changes }))
  const setChoice = (index, value) =>
    update({ choices: form.choices.map((c, i) => (i === index ? value : c)) })

  // Pilihan dihapus dari yang terakhir agar urutan gambar pilihan tidak tertukar.
  const removeLastChoice = () => {
    const last = form.choices.length - 1
    setPending((p) => ({
      ...p,
      [imageKey('choice', last)]: current[imageKey('choice', last)] ? 'remove' : undefined,
    }))
    update({
      choices: form.choices.slice(0, last),
      correct_choice: form.correct_choice === last ? null : form.correct_choice,
    })
  }

  const openMath = (field) => {
    const element = fields.current[field]
    setMathTarget({ field, position: element?.selectionStart ?? null })
  }
  const insertMath = (snippet) => {
    const { field, position } = mathTarget
    if (field.startsWith('choice-')) {
      const index = Number(field.slice(7))
      setChoice(index, insertAt(form.choices[index], position, snippet))
    } else {
      update({ [field]: insertAt(form[field], position, snippet) })
    }
    setMathTarget(null)
  }

  const imagePicker = (key, label) => (
    <ImagePicker
      label={label}
      current={current[key]}
      pending={pending[key]}
      onPick={(file) => setPending((p) => ({ ...p, [key]: file }))}
      onRemove={() => setPending((p) => ({ ...p, [key]: current[key] ? 'remove' : undefined }))}
    />
  )
  const mathButton = (field) => (
    <Button variant="ghost" size="sm" onClick={() => openMath(field)} aria-label="Sisipkan rumus">
      <Sigma className="size-4" aria-hidden="true" /> Rumus
    </Button>
  )

  return (
    <FormModal
      title={`${question ? 'Ubah' : 'Tambah'} Soal ${QUESTION_KINDS[questionKind]}`}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError}
    >
      {questionKind === 'choice' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">Contoh cepat:</span>
          {CHOICE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => update(preset.apply())}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-brand-50 hover:text-brand-800"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {showStimulus ? (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Stimulus / bacaan (opsional)</span>
            <button
              type="button"
              onClick={() => setShowStimulus(false)}
              className="text-xs text-red-600 hover:underline"
            >
              Hapus stimulus
            </button>
          </div>
          <TextAreaField
            ref={(el) => (fields.current.stimulus = el)}
            value={form.stimulus}
            onChange={(event) => update({ stimulus: event.target.value })}
            error={errors.stimulus}
            dir={form.text_direction}
            rows={3}
            aria-label="Stimulus"
          />
          <div className="flex flex-wrap gap-1">
            {mathButton('stimulus')}
            {imagePicker('stimulus', 'Gambar stimulus')}
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setShowStimulus(true)}>
          <Plus className="size-4" aria-hidden="true" /> Tambah stimulus (bacaan/gambar sebelum
          pertanyaan)
        </Button>
      )}

      <div className="space-y-2">
        <TextAreaField
          ref={(el) => (fields.current.text = el)}
          label="Pertanyaan"
          value={form.text}
          onChange={(event) => update({ text: event.target.value })}
          error={errors.text}
          dir={form.text_direction}
          rows={3}
          hint="Rumus: tulis di antara $...$, mis. $\frac{1}{2}$, atau pakai tombol Rumus."
          required
        />
        <div className="flex flex-wrap gap-1">
          {mathButton('text')}
          {imagePicker('question', 'Gambar soal')}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <TextField
          label="Poin"
          type="number"
          min={1}
          max={100}
          value={form.points}
          onChange={(event) => update({ points: event.target.value })}
          error={errors.points}
          required
        />
        <SelectField
          label="Arah teks"
          value={form.text_direction}
          onChange={(event) => update({ text_direction: event.target.value })}
          options={DIRECTIONS}
        />
      </div>

      {questionKind === 'choice' && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">
            Pilihan jawaban — klik lingkaran untuk menandai jawaban benar
          </legend>
          <div className="space-y-3">
            {form.choices.map((choice, index) => {
              const key = imageKey('choice', index)
              return (
                <div key={index} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct"
                      checked={form.correct_choice === index}
                      onChange={() => update({ correct_choice: index })}
                      className="size-4 text-brand-600"
                      aria-label={`Tandai pilihan ${choiceLetter(index)} sebagai jawaban benar`}
                    />
                    <span className="w-5 text-sm font-semibold text-slate-500">
                      {choiceLetter(index)}.
                    </span>
                    <input
                      ref={(el) => (fields.current[key] = el)}
                      value={choice}
                      dir={form.text_direction}
                      onChange={(event) => setChoice(index, event.target.value)}
                      placeholder={hasImage(key) ? '(boleh kosong: pilihan bergambar)' : ''}
                      className={`${inputClass} ${form.correct_choice === index ? 'ring-brand-600' : 'ring-slate-300'}`}
                      aria-label={`Pilihan ${choiceLetter(index)}`}
                      required={!hasImage(key)}
                    />
                    {index === form.choices.length - 1 && (
                      <button
                        type="button"
                        onClick={removeLastChoice}
                        disabled={form.choices.length <= 2}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                        aria-label={`Hapus pilihan ${choiceLetter(index)}`}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 pl-12">
                    {mathButton(key)}
                    {imagePicker(key, `Gambar pilihan ${choiceLetter(index)}`)}
                  </div>
                </div>
              )
            })}
          </div>
          {form.choices.length < MAX_CHOICES && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => update({ choices: [...form.choices, ''] })}
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

      {(form.text || form.stimulus) && (
        <section className="rounded-lg p-3 ring-1 ring-slate-200">
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Pratinjau (tampilan siswa)
          </p>
          {showStimulus && form.stimulus && (
            <RichText
              text={form.stimulus}
              dir={form.text_direction}
              className="mb-2 rounded bg-slate-50 p-2 text-slate-700"
            />
          )}
          <RichText
            text={form.text}
            dir={form.text_direction}
            className="font-medium text-slate-900"
          />
          {questionKind === 'choice' && (
            <ul dir={form.text_direction} className="mt-2 space-y-1 text-sm text-slate-700">
              {form.choices.map((choice, index) => (
                <li key={index} className="flex gap-2">
                  <span className="font-semibold">{choiceLetter(index)}.</span>
                  <RichText
                    text={choice || (hasImage(imageKey('choice', index)) ? '(gambar)' : '')}
                    as="span"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {mathTarget && <MathFieldDialog onInsert={insertMath} onClose={() => setMathTarget(null)} />}
    </FormModal>
  )
}
