import { Clock, Plus, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { videoSource } from '../../../api/assessments'
import Button from '../../../components/Button'
import VideoPlayer from '../../../components/interactive/VideoPlayer'
import SelectField from '../../../components/SelectField'
import TextAreaField from '../../../components/TextAreaField'
import TextField, { inputClass } from '../../../components/TextField'
import { choiceLetter } from '../../../utils/assessments'
import { MAX_VIDEO_UPLOAD_MB } from '../../../utils/constants'
import {
  CHECKPOINT_KINDS,
  emptyCheckpoint,
  formatTime,
  parseTime,
} from '../../../utils/interactive'
import { getYoutubeId } from '../../../utils/media'
import DragDropFields from './DragDropFields'
import FillBlankFields from './FillBlankFields'
import MatchingFields from './MatchingFields'

const MAX_CHECKPOINTS = 20
const MODES = [
  { value: 'exam', label: 'Ujian — tanpa umpan balik' },
  { value: 'practice', label: 'Latihan — tampilkan benar/salah + pembahasan' },
]
const SUB_EDITORS = {
  fill_blank: FillBlankFields,
  drag_drop: DragDropFields,
  matching: MatchingFields,
}

// Kotak waktu "menit:detik". Teks disimpan sendiri agar bisa diketik bebas.
function TimeInput({ value, onChange, label }) {
  const [text, setText] = useState(Number.isInteger(value) ? formatTime(value) : '')
  const [synced, setSynced] = useState(value)
  if (value !== synced) {
    // Nilai berubah dari luar (mis. tombol "waktu sekarang"): tampilkan nilai baru.
    setSynced(value)
    if (parseTime(text) !== value) setText(Number.isInteger(value) ? formatTime(value) : '')
  }
  const invalid = text !== '' && parseTime(text) === null
  return (
    <TextField
      label={label}
      value={text}
      inputMode="numeric"
      placeholder="m:ss"
      onChange={(event) => {
        setText(event.target.value)
        onChange(parseTime(event.target.value))
      }}
      error={invalid ? 'Format menit:detik, mis. 1:05' : undefined}
      required
    />
  )
}

function ChoiceFields({ checkpoint, onChange, dir }) {
  const choices = checkpoint.choices ?? []
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium text-slate-700">
        Pilihan — klik lingkaran untuk menandai jawaban benar
      </legend>
      {choices.map((choice, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="radio"
            checked={checkpoint.correct_choice === index}
            onChange={() => onChange({ correct_choice: index })}
            className="size-4 text-brand-600"
            aria-label={`Tandai pilihan ${choiceLetter(index)} sebagai jawaban benar`}
          />
          <span className="w-5 text-sm font-semibold text-slate-500">{choiceLetter(index)}.</span>
          <input
            value={choice}
            dir={dir}
            onChange={(event) =>
              onChange({ choices: choices.map((c, i) => (i === index ? event.target.value : c)) })
            }
            aria-label={`Pilihan ${choiceLetter(index)}`}
            className={`${inputClass} ring-slate-300`}
            required
          />
          {index === choices.length - 1 && choices.length > 2 && (
            <button
              type="button"
              onClick={() =>
                onChange({
                  choices: choices.slice(0, -1),
                  correct_choice:
                    checkpoint.correct_choice === index ? null : checkpoint.correct_choice,
                })
              }
              className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
              aria-label={`Hapus pilihan ${choiceLetter(index)}`}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      {choices.length < 6 && (
        <Button variant="ghost" size="sm" onClick={() => onChange({ choices: [...choices, ''] })}>
          <Plus className="size-4" aria-hidden="true" /> Tambah pilihan
        </Button>
      )}
    </fieldset>
  )
}

function CheckpointCard({ checkpoint, number, onChange, onRemove, currentTime, dir }) {
  const set = (changes) => onChange({ ...checkpoint, ...changes })
  const SubEditor = SUB_EDITORS[checkpoint.kind]
  return (
    <li className="space-y-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-slate-800">Checkpoint {number}</p>
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
          aria-label={`Hapus checkpoint ${number}`}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="grid items-end gap-3 sm:grid-cols-[8rem_auto_1fr_6rem]">
        <TimeInput label="Waktu" value={checkpoint.time} onChange={(time) => set({ time })} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => set({ time: Math.floor(currentTime()) })}
          aria-label={`Pakai waktu video sekarang untuk checkpoint ${number}`}
        >
          <Clock className="size-4" aria-hidden="true" /> Waktu sekarang
        </Button>
        <SelectField
          label="Jenis sub-soal"
          value={checkpoint.kind}
          options={CHECKPOINT_KINDS}
          onChange={(event) => {
            const { time, text, points, required, explanation } = checkpoint
            onChange({
              ...emptyCheckpoint(event.target.value),
              time,
              text,
              points,
              required,
              explanation,
            })
          }}
        />
        <TextField
          label="Poin"
          type="number"
          min={1}
          max={100}
          value={checkpoint.points}
          onChange={(event) => set({ points: Number(event.target.value) })}
          required
        />
      </div>
      <TextAreaField
        label={
          ['choice', 'matching'].includes(checkpoint.kind)
            ? 'Pertanyaan'
            : 'Pertanyaan / petunjuk (opsional)'
        }
        value={checkpoint.text}
        onChange={(event) => set({ text: event.target.value })}
        dir={dir}
        rows={2}
      />
      {checkpoint.kind === 'choice' ? (
        <ChoiceFields checkpoint={checkpoint} onChange={set} dir={dir} />
      ) : (
        <SubEditor
          spec={checkpoint}
          onChange={(sub) => onChange({ ...checkpoint, ...sub })}
          dir={dir}
          // Pilihan bergambar tidak tersedia di dalam video (cukup teks).
          imagePicker={() => null}
          hasImage={() => false}
        />
      )}
      <TextAreaField
        label="Pembahasan (opsional)"
        value={checkpoint.explanation}
        onChange={(event) => set({ explanation: event.target.value })}
        dir={dir}
        rows={2}
        hint="Pada mode latihan, pembahasan tampil setelah siswa menjawab."
      />
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={checkpoint.required !== false}
          onChange={(event) => set({ required: event.target.checked })}
          className="size-4 rounded text-brand-600"
        />
        Wajib dijawab (jika tidak dicentang, siswa boleh melewati pertanyaan ini)
      </label>
    </li>
  )
}

/**
 * Rancangan video interaktif: sumber (YouTube / file), mode, boleh lompat, dan checkpoint.
 * Durasi dibaca dari pemutar di browser agar checkpoint tidak melebihi panjang video.
 */
export default function VideoFields({
  spec,
  onChange,
  dir,
  question,
  pending,
  setPendingFile,
  onInfo,
}) {
  const controls = useRef(null)
  const fileInput = useRef(null)
  const file = pending.video instanceof File ? pending.video : null
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => fileUrl && URL.revokeObjectURL(fileUrl), [fileUrl])
  const savedUrl = question?.content?.video_url ? videoSource(question.content.video_url) : null
  const videoUrl = spec.source === 'file' ? (fileUrl ?? savedUrl) : null
  const youtubeId = spec.source === 'youtube' ? getYoutubeId(spec.url) : null

  useEffect(() => {
    onInfo({
      hasVideo: Boolean(file || savedUrl),
      videoFile: fileUrl,
      videoUrl: fileUrl ?? savedUrl,
    })
  }, [file, fileUrl, savedUrl, onInfo])

  const checkpoints = spec.checkpoints ?? []
  const set = (changes) => onChange({ ...spec, ...changes })
  const setCheckpoint = (index, checkpoint) =>
    set({ checkpoints: checkpoints.map((cp, i) => (i === index ? checkpoint : cp)) })
  const currentTime = () => controls.current?.time() ?? 0
  const addCheckpoint = () => {
    const now = Math.floor(currentTime())
    const lastTime = checkpoints.reduce((max, cp) => Math.max(max, cp.time ?? 0), 0)
    set({ checkpoints: [...checkpoints, emptyCheckpoint('choice', now || lastTime + 10)] })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sumber video">
        {[
          ['youtube', 'YouTube'],
          ['file', 'File video (unggah)'],
        ].map(([value, label]) => (
          <label
            key={value}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium ring-1 has-[:focus-visible]:outline-2 ${
              spec.source === value
                ? 'bg-brand-600 text-white ring-brand-600'
                : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
            }`}
          >
            <input
              type="radio"
              name="video-source"
              className="sr-only"
              checked={spec.source === value}
              onChange={() => set({ source: value, duration: null })}
            />
            {label}
          </label>
        ))}
      </div>

      {spec.source === 'youtube' ? (
        <TextField
          label="Link YouTube"
          value={spec.url ?? ''}
          onChange={(event) => set({ url: event.target.value, duration: null })}
          placeholder="https://www.youtube.com/watch?v=... atau https://youtu.be/..."
          hint={
            youtubeId
              ? `ID video: ${youtubeId}`
              : 'Bisa link watch, youtu.be, atau shorts. ID video diambil otomatis.'
          }
          required
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="video/mp4,video/webm"
            className="hidden"
            onChange={(event) => {
              const picked = event.target.files[0]
              if (picked) {
                setPendingFile('video', picked)
                set({ duration: null })
              }
              event.target.value = ''
            }}
          />
          <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload className="size-4" aria-hidden="true" />
            {file || savedUrl ? 'Ganti video' : 'Pilih video'}
          </Button>
          <span className="text-sm text-slate-600">
            {file?.name ?? question?.content?.video_name ?? 'Belum ada video.'}
          </span>
          <span className="text-xs text-slate-500">MP4/WEBM, maks. {MAX_VIDEO_UPLOAD_MB} MB.</span>
        </div>
      )}

      {(youtubeId || videoUrl) && (
        <div className="space-y-1">
          <VideoPlayer
            key={youtubeId ?? videoUrl}
            source={spec.source}
            youtubeId={youtubeId}
            src={videoUrl}
            onReady={(api) => {
              controls.current = api
            }}
            onDuration={(seconds) => {
              const duration = Math.round(seconds * 10) / 10
              if (duration > 0 && duration !== spec.duration) set({ duration })
            }}
          />
          <p className="text-xs text-slate-500">
            Durasi:{' '}
            {spec.duration ? formatTime(spec.duration) : 'terbaca setelah video dimuat/diputar'}.
            Putar video lalu tekan "Waktu sekarang" untuk mengisi waktu checkpoint.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Mode"
          value={spec.mode ?? 'exam'}
          options={MODES}
          onChange={(event) => set({ mode: event.target.value })}
        />
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(spec.allow_seek)}
            onChange={(event) => set({ allow_seek: event.target.checked })}
            className="size-4 rounded text-brand-600"
          />
          Boleh lompat ke depan (melewati pertanyaan yang belum dijawab)
        </label>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">
          Checkpoint — video berhenti dan pertanyaan muncul pada waktu ini
        </p>
        {checkpoints.length === 0 && (
          <p className="mb-2 text-sm text-slate-500">Belum ada checkpoint.</p>
        )}
        <ol className="space-y-3">
          {checkpoints.map((cp, index) => (
            <CheckpointCard
              key={index}
              checkpoint={cp}
              number={index + 1}
              dir={dir}
              currentTime={currentTime}
              onChange={(next) => setCheckpoint(index, next)}
              onRemove={() => set({ checkpoints: checkpoints.filter((_, i) => i !== index) })}
            />
          ))}
        </ol>
        {checkpoints.length < MAX_CHECKPOINTS && (
          <Button variant="secondary" size="sm" className="mt-3" onClick={addCheckpoint}>
            <Plus className="size-4" aria-hidden="true" /> Tambah checkpoint
          </Button>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Poin soal = jumlah poin semua checkpoint (maks. 100). Mode skor sebagian berlaku untuk
          sub-soal isian, tarik & lepas, dan menjodohkan.
        </p>
      </div>
    </div>
  )
}
