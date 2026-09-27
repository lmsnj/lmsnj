import { ImagePlus, Plus, Sigma, Table, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { questionsApi } from '../../api/assessments'
import AnswerReview from '../../components/AnswerReview'
import AuthImage from '../../components/AuthImage'
import Button from '../../components/Button'
import FormModal from '../../components/FormModal'
import MathFieldDialog from '../../components/MathFieldDialog'
import { QuestionBody } from '../../components/QuestionContent'
import SelectField from '../../components/SelectField'
import TextAreaField from '../../components/TextAreaField'
import TextField, { inputClass } from '../../components/TextField'
import useFormSubmit from '../../hooks/useFormSubmit'
import { choiceLetter, QUESTION_KINDS } from '../../utils/assessments'
import { toggleChoice } from '../../utils/exam'
import { insertAt } from '../../utils/richText'

const MAX_CHOICES = 6
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp'

const DIRECTIONS = [
  { value: 'auto', label: 'Otomatis (ikuti huruf pertama)' },
  { value: 'rtl', label: 'Kanan ke kiri (bahasa Arab)' },
  { value: 'ltr', label: 'Kiri ke kanan' },
]

// Nilai awal per jenis soal: poin dan jumlah pilihan/pernyataan kosong.
const KIND_DEFAULTS = {
  choice: { points: 1, choices: 4 },
  multiple: { points: 2, choices: 4 },
  category: { points: 2, choices: 3 },
  essay: { points: 5, choices: 0 },
}

// Contoh cepat per jenis soal.
const PRESETS = {
  choice: [
    { label: 'Benar / Salah', apply: () => ({ choices: ['Benar', 'Salah'] }) },
    { label: '4 pilihan (A–D)', apply: () => ({ choices: ['', '', '', ''] }) },
    { label: '5 pilihan (A–E)', apply: () => ({ choices: ['', '', '', '', ''] }) },
  ],
  multiple: [
    { label: '4 pilihan (A–D)', apply: () => ({ choices: ['', '', '', ''], correct_choices: [] }) },
    {
      label: '5 pilihan (A–E)',
      apply: () => ({ choices: ['', '', '', '', ''], correct_choices: [] }),
    },
  ],
  category: [
    { label: 'Benar / Salah', apply: () => ({ category_labels: ['Benar', 'Salah'] }) },
    {
      label: 'Sesuai / Tidak sesuai',
      apply: () => ({ category_labels: ['Sesuai', 'Tidak sesuai'] }),
    },
    { label: 'Fakta / Opini', apply: () => ({ category_labels: ['Fakta', 'Opini'] }) },
    { label: 'Ya / Tidak', apply: () => ({ category_labels: ['Ya', 'Tidak'] }) },
  ],
  essay: [],
}
const ARABIC_PRESET = { label: 'Soal bahasa Arab', apply: () => ({ text_direction: 'rtl' }) }

// Kerangka tabel yang disisipkan tombol "Tabel" (lihat format di utils/richText.js).
const TABLE_SNIPPET = `
| Judul 1 | Judul 2 | Judul 3 |
|---|---|---|
| isi | isi | isi |
| isi | isi | isi |
`

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

function initialForm(question, kind) {
  const defaults = KIND_DEFAULTS[kind]
  return {
    group: question?.group ?? '',
    stimulus: question?.stimulus ?? '',
    text: question?.text ?? '',
    text_direction: question?.text_direction ?? 'auto',
    points: question?.points ?? defaults.points,
    choices: question?.choices?.length ? question.choices : Array(defaults.choices).fill(''),
    correct_choice: question?.correct_choice ?? null,
    correct_choices: question?.correct_choices ?? [],
    category_labels: question?.category_labels?.length
      ? question.category_labels
      : ['Benar', 'Salah'],
  }
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

/**
 * Tambah/ubah satu soal. `kind`: 'choice' (pilihan ganda), 'multiple' (PG kompleks),
 * 'category' (kategori Benar/Salah), atau 'essay'.
 */
export default function QuestionFormModal({
  question,
  assessmentId,
  kind,
  nextOrder,
  onClose,
  onSaved,
}) {
  const questionKind = question?.kind ?? kind
  const isCategory = questionKind === 'category'
  const hasChoices = questionKind !== 'essay'
  const [form, setForm] = useState(() => initialForm(question, questionKind))
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
      group: form.group,
      stimulus: showStimulus ? form.stimulus : '',
      text: form.text,
      text_direction: form.text_direction,
      points: Number(form.points),
    }
    if (hasChoices) {
      data.choices = form.choices
      // Pilihan bergambar boleh tanpa teks.
      data.image_choices = form.choices
        .map((_, i) => i)
        .filter((i) => hasImage(imageKey('choice', i)))
    }
    if (questionKind === 'choice') data.correct_choice = form.correct_choice
    if (questionKind === 'multiple') data.correct_choices = form.correct_choices
    if (isCategory) {
      data.correct_choices = form.choices.map((_, i) => form.correct_choices[i] ?? null)
      data.category_labels = form.category_labels
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
  const setCategoryKey = (index, label) =>
    update({
      correct_choices: form.choices.map((_, i) =>
        i === index ? label : (form.correct_choices[i] ?? null),
      ),
    })
  const setLabel = (index, value) =>
    update({ category_labels: form.category_labels.map((l, i) => (i === index ? value : l)) })

  // Pilihan dihapus dari yang terakhir agar urutan gambar pilihan tidak tertukar.
  const minChoices = isCategory ? 1 : 2
  const removeLastChoice = () => {
    const last = form.choices.length - 1
    setPending((p) => ({
      ...p,
      [imageKey('choice', last)]: current[imageKey('choice', last)] ? 'remove' : undefined,
    }))
    update({
      choices: form.choices.slice(0, last),
      correct_choice: form.correct_choice === last ? null : form.correct_choice,
      correct_choices: isCategory
        ? form.correct_choices.slice(0, last)
        : form.correct_choices.filter((i) => i !== last),
    })
  }

  const cursorOf = (field) => fields.current[field]?.selectionStart ?? null
  const insertInto = (field, position, snippet) => {
    if (field.startsWith('choice-')) {
      const index = Number(field.slice(7))
      setChoice(index, insertAt(form.choices[index], position, snippet))
    } else {
      update({ [field]: insertAt(form[field], position, snippet) })
    }
  }
  const insertMath = (snippet) => {
    insertInto(mathTarget.field, mathTarget.position, snippet)
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
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setMathTarget({ field, position: cursorOf(field) })}
      aria-label="Sisipkan rumus"
    >
      <Sigma className="size-4" aria-hidden="true" /> Rumus
    </Button>
  )
  const tableButton = (field) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => insertInto(field, cursorOf(field), TABLE_SNIPPET)}
      aria-label="Sisipkan tabel"
    >
      <Table className="size-4" aria-hidden="true" /> Tabel
    </Button>
  )
  const presets = [...PRESETS[questionKind], ...(hasChoices ? [ARABIC_PRESET] : [])]
  const itemName = isCategory ? 'pernyataan' : 'pilihan'
  const itemLabel = (index) => (isCategory ? `${index + 1}` : choiceLetter(index))
  const choiceError = errors.choices || errors.correct_choice || errors.correct_choices

  const preview = {
    ...form,
    kind: questionKind,
    stimulus: showStimulus ? form.stimulus : '',
    choices: form.choices.map(
      (choice, i) => choice || (hasImage(imageKey('choice', i)) ? '(gambar)' : ''),
    ),
    images: null,
  }

  return (
    <FormModal
      title={`${question ? 'Ubah' : 'Tambah'} Soal ${QUESTION_KINDS[questionKind]}`}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError}
    >
      {presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">Contoh cepat:</span>
          {presets.map((preset) => (
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
            rows={4}
            aria-label="Stimulus"
            hint="Baris kosong = paragraf baru. *miring*, **tebal**. Tabel: pakai tombol Tabel."
          />
          <div className="flex flex-wrap gap-1">
            {mathButton('stimulus')}
            {tableButton('stimulus')}
            {imagePicker('stimulus', 'Gambar stimulus')}
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setShowStimulus(true)}>
          <Plus className="size-4" aria-hidden="true" /> Tambah stimulus (bacaan/tabel/gambar
          sebelum pertanyaan)
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
          hint="Rumus: tulis di antara $...$, mis. $\frac{1}{2}$, atau pakai tombol Rumus. *miring*, **tebal**."
          required
        />
        <div className="flex flex-wrap gap-1">
          {mathButton('text')}
          {tableButton('text')}
          {imagePicker('question', 'Gambar soal')}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[6rem_1fr_8rem]">
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
        <TextField
          label="Grup stimulus"
          value={form.group}
          onChange={(event) => update({ group: event.target.value })}
          error={errors.group}
          placeholder="mis. G1"
          maxLength={30}
        />
      </div>
      <p className="-mt-2 text-xs text-slate-500">
        Grup: soal-soal dengan kode grup yang sama memakai stimulus bersama. Isi stimulus hanya di
        soal pertama grup itu.
      </p>

      {isCategory && (
        <div className="grid gap-3 sm:grid-cols-2">
          {form.category_labels.map((label, index) => (
            <TextField
              key={index}
              label={`Label jawaban ${index + 1}`}
              value={label}
              onChange={(event) => setLabel(index, event.target.value)}
              maxLength={30}
              required
            />
          ))}
          {errors.category_labels && (
            <p className="text-xs text-red-600 sm:col-span-2">{errors.category_labels}</p>
          )}
        </div>
      )}

      {hasChoices && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">
            {questionKind === 'choice' &&
              'Pilihan jawaban — klik lingkaran untuk menandai jawaban benar'}
            {questionKind === 'multiple' &&
              'Pilihan jawaban — centang SEMUA jawaban benar (minimal dua)'}
            {isCategory && 'Pernyataan — pilih jawaban benar untuk setiap pernyataan'}
          </legend>
          <div className="space-y-3">
            {form.choices.map((choice, index) => {
              const key = imageKey('choice', index)
              const marked =
                questionKind === 'choice'
                  ? form.correct_choice === index
                  : questionKind === 'multiple' && form.correct_choices.includes(index)
              return (
                <div key={index} className="space-y-1">
                  <div className="flex items-center gap-2">
                    {questionKind === 'choice' && (
                      <input
                        type="radio"
                        name="correct"
                        checked={marked}
                        onChange={() => update({ correct_choice: index })}
                        className="size-4 text-brand-600"
                        aria-label={`Tandai pilihan ${choiceLetter(index)} sebagai jawaban benar`}
                      />
                    )}
                    {questionKind === 'multiple' && (
                      <input
                        type="checkbox"
                        checked={marked}
                        onChange={() =>
                          update({ correct_choices: toggleChoice(form.correct_choices, index) })
                        }
                        className="size-4 rounded text-brand-600"
                        aria-label={`Tandai pilihan ${choiceLetter(index)} sebagai jawaban benar`}
                      />
                    )}
                    <span className="w-5 text-sm font-semibold text-slate-500">
                      {itemLabel(index)}.
                    </span>
                    <input
                      ref={(el) => (fields.current[key] = el)}
                      value={choice}
                      dir={form.text_direction}
                      onChange={(event) => setChoice(index, event.target.value)}
                      placeholder={hasImage(key) ? `(boleh kosong: ${itemName} bergambar)` : ''}
                      className={`${inputClass} ${marked ? 'ring-brand-600' : 'ring-slate-300'}`}
                      aria-label={`${isCategory ? 'Pernyataan' : 'Pilihan'} ${itemLabel(index)}`}
                      required={!hasImage(key)}
                    />
                    {index === form.choices.length - 1 && (
                      <button
                        type="button"
                        onClick={removeLastChoice}
                        disabled={form.choices.length <= minChoices}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                        aria-label={`Hapus ${itemName} ${itemLabel(index)}`}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 pl-7">
                    {isCategory && (
                      <div
                        role="radiogroup"
                        aria-label={`Jawaban benar pernyataan ${index + 1}`}
                        className="mr-2 flex overflow-hidden rounded-lg ring-1 ring-slate-300"
                      >
                        {form.category_labels.map((label, l) => (
                          <label
                            key={l}
                            className={`cursor-pointer px-3 py-1 text-xs font-medium has-[:focus-visible]:outline-2 ${
                              form.correct_choices[index] === l
                                ? 'bg-brand-600 text-white'
                                : 'bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`key-${index}`}
                              checked={form.correct_choices[index] === l}
                              onChange={() => setCategoryKey(index, l)}
                              className="sr-only"
                            />
                            {label || `Label ${l + 1}`}
                          </label>
                        ))}
                      </div>
                    )}
                    {mathButton(key)}
                    {imagePicker(key, `Gambar ${itemName} ${itemLabel(index)}`)}
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
              <Plus className="size-4" aria-hidden="true" /> Tambah {itemName}
            </Button>
          )}
          {choiceError && <p className="mt-1 text-xs text-red-600">{choiceError}</p>}
        </fieldset>
      )}
      {questionKind === 'essay' && (
        <p className="text-xs text-slate-500">
          Jawaban esai dinilai manual oleh guru di tab Hasil. Esai yang dibiarkan kosong otomatis
          bernilai 0.
        </p>
      )}
      {(questionKind === 'multiple' || isCategory) && (
        <p className="text-xs text-slate-500">
          Poin penuh hanya jika semua jawaban tepat
          {questionKind === 'multiple'
            ? ' (semua jawaban benar dicentang dan tidak ada yang salah).'
            : ' untuk setiap pernyataan.'}{' '}
          Selain itu 0.
        </p>
      )}

      {(form.text || form.stimulus) && (
        <section className="space-y-2 rounded-lg p-3 ring-1 ring-slate-200">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Pratinjau (tampilan siswa)
          </p>
          <QuestionBody question={preview} />
          {hasChoices && <AnswerReview question={preview} />}
        </section>
      )}

      {mathTarget && <MathFieldDialog onInsert={insertMath} onClose={() => setMathTarget(null)} />}
    </FormModal>
  )
}
