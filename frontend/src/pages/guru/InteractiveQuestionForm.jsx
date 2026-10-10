import { Plus } from 'lucide-react'
import { useState } from 'react'
import { questionsApi } from '../../api/assessments'
import Button from '../../components/Button'
import ProgressBar from '../../components/ProgressBar'
import FormModal from '../../components/FormModal'
import ImagePicker from '../../components/ImagePicker'
import InteractiveAnswer from '../../components/interactive/InteractiveAnswer'
import { QuestionBody } from '../../components/QuestionContent'
import SelectField from '../../components/SelectField'
import TextAreaField from '../../components/TextAreaField'
import TextField from '../../components/TextField'
import useFormSubmit from '../../hooks/useFormSubmit'
import { QUESTION_KINDS } from '../../utils/assessments'
import { instructionFor } from '../../utils/exam'
import { emptySpec, previewContent, SCORING_MODES, specError } from '../../utils/interactive'
import DragDropFields from './question-forms/DragDropFields'
import FillBlankFields from './question-forms/FillBlankFields'
import MatchingFields from './question-forms/MatchingFields'
import VideoFields from './question-forms/VideoFields'

const DIRECTIONS = [
  { value: 'auto', label: 'Otomatis (ikuti huruf pertama)' },
  { value: 'rtl', label: 'Kanan ke kiri (bahasa Arab)' },
  { value: 'ltr', label: 'Kiri ke kanan' },
]

const EDITORS = {
  fill_blank: FillBlankFields,
  drag_drop: DragDropFields,
  matching: MatchingFields,
  interactive_video: VideoFields,
}

// Contoh cepat per jenis soal (mengisi rancangan soal).
const PRESETS = {
  fill_blank: [
    {
      label: 'Singkatan',
      spec: { template: 'HTML singkatan dari [[HyperText|Hypertext]] Markup [[Language]].' },
    },
    {
      label: 'Rumus',
      spec: { template: 'Hasil dari $2^{3}$ adalah [[8|delapan]].' },
    },
  ],
  drag_drop: [
    {
      label: 'Geografi',
      spec: {
        template: 'Ibu kota Indonesia adalah [[Jakarta]] di pulau [[Jawa]].',
        distractors: ['Bandung', 'Sumatra'],
      },
    },
    {
      label: 'Tag HTML',
      spec: {
        template: 'Tag [[<h1>]] untuk judul, tag [[<p>]] untuk paragraf.',
        distractors: ['<a>', '<img>'],
      },
    },
  ],
  matching: [
    {
      label: 'Tag HTML',
      spec: {
        pairs: [
          { left: '<h1>', right: 'Judul' },
          { left: '<p>', right: 'Paragraf' },
          { left: '<a>', right: 'Tautan' },
        ],
        distractors: ['Gambar'],
      },
    },
    {
      label: 'Satuan',
      spec: {
        pairs: [
          { left: 'Hambatan', right: 'Ohm ($\\Omega$)' },
          { left: 'Tegangan', right: 'Volt (V)' },
          { left: 'Arus', right: 'Ampere (A)' },
        ],
        distractors: [],
      },
    },
  ],
}

// Kunci gambar: 'stimulus', 'question', atau 'choice-<nomor>' (pilihan tarik & lepas).
const keyToSlot = (key) => (key.startsWith('choice-') ? ['choice', Number(key.slice(7))] : [key, 0])

function existingImages(question) {
  const images = question?.images
  const result = {}
  if (!images) return result
  if (images.stimulus) result.stimulus = images.stimulus
  if (images.question) result.question = images.question
  images.choices?.forEach((image, index) => {
    if (image) result[`choice-${index}`] = image
  })
  return result
}

/**
 * Form soal interaktif (isian singkat, tarik & lepas, menjodohkan, video interaktif).
 * Guru mengisi rancangan (`spec`); server membuat isi soal & kunci. Pratinjau di bawah memakai
 * komponen yang sama dengan halaman ujian siswa.
 */
export default function InteractiveQuestionForm({
  question,
  assessmentId,
  kind,
  nextOrder,
  onClose,
  onSaved,
}) {
  const questionKind = question?.kind ?? kind
  const Editor = EDITORS[questionKind]
  const [form, setForm] = useState(() => ({
    group: question?.group ?? '',
    stimulus: question?.stimulus ?? '',
    text: question?.text ?? '',
    text_direction: question?.text_direction ?? 'auto',
    points: question?.points ?? 4,
    scoring_mode: question?.scoring_mode ?? 'partial',
    spec: question?.spec ?? emptySpec(questionKind),
  }))
  const [showStimulus, setShowStimulus] = useState(
    Boolean(question?.stimulus || question?.images?.stimulus),
  )
  const [current] = useState(() => existingImages(question))
  // Perubahan gambar/video yang disimpan setelah soal tersimpan: File baru, atau 'remove'.
  const [pending, setPending] = useState({})
  const [clientError, setClientError] = useState('')
  const [previewValue, setPreviewValue] = useState({})
  // Tambahan dari editor video: { hasVideo, videoUrl } untuk validasi & pratinjau.
  const [editorInfo, setEditorInfo] = useState({})
  const [uploadProgress, setUploadProgress] = useState(null)

  const hasImage = (key) =>
    pending[key] instanceof File || (current[key] && pending[key] !== 'remove')
  const update = (changes) => setForm((f) => ({ ...f, ...changes }))

  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    setUploadProgress(null)
    const problem = specError(questionKind, form.spec, { ...editorInfo, hasImage })
    setClientError(problem)
    if (problem) return
    const imageChoices = Object.keys(current)
      .concat(Object.keys(pending))
      .filter((key) => key.startsWith('choice-') && hasImage(key))
      .map((key) => keyToSlot(key)[1])
    const data = {
      kind: questionKind,
      group: form.group,
      stimulus: showStimulus ? form.stimulus : '',
      text: form.text,
      text_direction: form.text_direction,
      points: Number(form.points),
      scoring_mode: form.scoring_mode,
      spec: form.spec,
      image_choices: [...new Set(imageChoices)],
    }
    let saved = question
      ? await questionsApi.update(question.id, data)
      : await questionsApi.create({ ...data, assessment: assessmentId, order: nextOrder })
    for (const [key, change] of Object.entries(pending)) {
      if (!change) continue
      const [slot, index] = keyToSlot(key)
      if (slot === 'stimulus' && !showStimulus) continue
      if (slot === 'video' && form.spec.source !== 'file') continue
      if (change === 'remove') await questionsApi.removeImage(saved.id, slot, index)
      else {
        const onProgress = slot === 'video' ? setUploadProgress : undefined
        saved = await questionsApi.uploadImage(saved.id, slot, index, change, onProgress)
      }
    }
    setUploadProgress(null)
    if (!showStimulus && current.stimulus) await questionsApi.removeImage(saved.id, 'stimulus', 0)
    onSaved(saved)
  })

  const imagePicker = (key, label) => (
    <ImagePicker
      label={label}
      current={current[key]}
      pending={pending[key]}
      onPick={(file) => setPending((p) => ({ ...p, [key]: file }))}
      onRemove={() => setPending((p) => ({ ...p, [key]: current[key] ? 'remove' : undefined }))}
    />
  )
  const setPendingFile = (key, file) => setPending((p) => ({ ...p, [key]: file }))

  const content = previewContent(questionKind, form.spec, {
    pending,
    current,
    videoUrl: editorInfo.videoUrl,
  })
  const preview = {
    ...form,
    id: question?.id ?? 'pratinjau',
    kind: questionKind,
    text: form.text || instructionFor({ kind: questionKind }),
    stimulus: showStimulus ? form.stimulus : '',
    images: null,
    content,
  }
  const isVideo = questionKind === 'interactive_video'
  const problem = errors.spec || clientError

  return (
    <FormModal
      size="lg"
      title={`${question ? 'Ubah' : 'Tambah'} Soal ${QUESTION_KINDS[questionKind]}`}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError}
    >
      {PRESETS[questionKind]?.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">Contoh cepat:</span>
          {PRESETS[questionKind].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => update({ spec: { ...emptySpec(questionKind), ...preset.spec } })}
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
            value={form.stimulus}
            onChange={(event) => update({ stimulus: event.target.value })}
            error={errors.stimulus}
            dir={form.text_direction}
            rows={3}
            aria-label="Stimulus"
          />
          {imagePicker('stimulus', 'Gambar stimulus')}
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setShowStimulus(true)}>
          <Plus className="size-4" aria-hidden="true" /> Tambah stimulus (bacaan/tabel/gambar)
        </Button>
      )}

      <div className="space-y-2">
        <TextAreaField
          label="Pertanyaan / petunjuk (opsional)"
          value={form.text}
          onChange={(event) => update({ text: event.target.value })}
          error={errors.text}
          dir={form.text_direction}
          rows={2}
          placeholder={instructionFor({ kind: questionKind }).split('.')[0]}
          hint="Kosongkan untuk memakai petunjuk bawaan."
        />
        {imagePicker('question', 'Gambar soal')}
      </div>

      <div className="grid gap-4 sm:grid-cols-[6rem_1fr_1fr_7rem]">
        {isVideo ? (
          <div>
            <span className="block text-sm font-medium text-slate-700">Poin</span>
            <p className="mt-2 text-sm text-slate-600">
              {(form.spec.checkpoints ?? []).reduce((sum, cp) => sum + (Number(cp.points) || 0), 0)}{' '}
              (otomatis)
            </p>
          </div>
        ) : (
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
        )}
        <SelectField
          label="Mode skor"
          value={form.scoring_mode}
          onChange={(event) => update({ scoring_mode: event.target.value })}
          options={SCORING_MODES}
        />
        <SelectField
          label="Arah teks"
          value={form.text_direction}
          onChange={(event) => update({ text_direction: event.target.value })}
          options={DIRECTIONS}
        />
        <TextField
          label="Grup"
          value={form.group}
          onChange={(event) => update({ group: event.target.value })}
          error={errors.group}
          placeholder="mis. G1"
          maxLength={30}
        />
      </div>

      <section className="space-y-3 rounded-lg p-3 ring-1 ring-brand-200">
        <Editor
          spec={form.spec}
          onChange={(spec) => update({ spec })}
          error={problem}
          dir={form.text_direction}
          imagePicker={imagePicker}
          hasImage={hasImage}
          question={question}
          current={current}
          pending={pending}
          setPendingFile={setPendingFile}
          onInfo={setEditorInfo}
        />
        {problem && <p className="text-sm text-red-600">{problem}</p>}
        {uploadProgress !== null && (
          <div className="space-y-1">
            <p className="text-sm text-slate-600">Mengunggah video… {uploadProgress}%</p>
            <ProgressBar value={uploadProgress} max={100} />
          </div>
        )}
      </section>

      {content && (
        <section className="space-y-3 rounded-lg p-3 ring-1 ring-slate-200">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Pratinjau (tampilan siswa — silakan dicoba)
          </p>
          <QuestionBody question={preview} />
          <InteractiveAnswer
            question={preview}
            value={previewValue}
            onChange={setPreviewValue}
            preview
          />
        </section>
      )}
    </FormModal>
  )
}
