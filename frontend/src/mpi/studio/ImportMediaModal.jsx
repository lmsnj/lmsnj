import {
  FileJson,
  FileSpreadsheet,
  FileText,
  Library,
  Link2,
  Presentation,
  ScrollText,
  Workflow,
} from 'lucide-react'
import { useState } from 'react'
import { assessmentsApi } from '../../api/assessments'
import { learningMediaApi } from '../../api/learningMedia'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import FileDownloadButton from '../../components/FileDownloadButton'
import Modal from '../../components/Modal'
import SelectField from '../../components/SelectField'
import TextAreaField from '../../components/TextAreaField'
import useFetch from '../../hooks/useFetch'
import { ALL, toOptions } from '../../utils/academic'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import { defaultImportMode, IMPORT_SOURCES, importPayload } from '../studio'

const SOURCES = [
  {
    id: 'excel',
    icon: FileSpreadsheet,
    label: 'Excel / CSV',
    description: 'Unduh template (berisi isi media ini), ubah di Excel, lalu impor ulang.',
  },
  {
    id: 'word',
    icon: FileText,
    label: 'Word (.docx)',
    description:
      'Judul 1 = bagian, Judul 2 = stasiun, paragraf = langkah. Soal "1. A. B. Kunci:" jadi latihan.',
  },
  {
    id: 'pptx',
    icon: Presentation,
    label: 'PowerPoint',
    description:
      'Satu slide = satu langkah (judul, isi, gambar). Slide "Section Header" = stasiun baru.',
  },
  {
    id: 'pdf',
    icon: ScrollText,
    label: 'PDF',
    description: 'Satu halaman = satu langkah teks. PDF hasil pindai tidak berisi teks.',
  },
  {
    id: 'fprg',
    icon: Workflow,
    label: 'Flowgorithm (.fprg)',
    description: 'Program Flowgorithm asli menjadi langkah lab yang bisa dijalankan siswa.',
  },
  {
    id: 'links',
    icon: Link2,
    label: 'Daftar tautan',
    description: 'YouTube/Drive jadi langkah video, alamat lain jadi tombol tautan.',
  },
  {
    id: 'bank',
    icon: Library,
    label: 'Bank soal',
    description: 'Ambil soal dari asesmen kelas Anda menjadi latihan (dinilai otomatis).',
  },
  {
    id: 'json',
    icon: FileJson,
    label: 'JSON',
    description: 'Hasil "Ekspor JSON" media lain (mis. dari sekolah lain).',
  },
]

const STEP_TITLES = ['Pilih sumber', 'Periksa', 'Terapkan']
const UNSUPPORTED = new Set(['essay', 'interactive_video'])
const noAssessment = async () => []

function Steps({ current }) {
  return (
    <ol className="flex gap-2 text-xs font-semibold">
      {STEP_TITLES.map((title, index) => (
        <li
          key={title}
          className={`flex flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 ${
            index === current
              ? 'bg-brand-600 text-white'
              : index < current
                ? 'bg-brand-50 text-brand-800'
                : 'bg-slate-100 text-slate-500'
          }`}
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-white/30">
            {index + 1}
          </span>
          {title}
        </li>
      ))}
    </ol>
  )
}

function MessageList({ type, title, items, limit = 10 }) {
  if (!items?.length) return null
  return (
    <Alert type={type}>
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 ps-5">
        {items.slice(0, limit).map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
      {items.length > limit && <p className="mt-1">…dan {items.length - limit} lainnya.</p>}
    </Alert>
  )
}

function BankPicker({ assessment, setAssessment, questions, setQuestions }) {
  const assessments = useFetch(assessmentsApi.list, ALL)
  const list = assessments.data?.results ?? []
  const detail = useFetch(assessment ? assessmentsApi.questions : noAssessment, assessment || null)
  const items = Array.isArray(detail.data) ? detail.data : (detail.data?.results ?? [])
  const usable = items.filter((q) => !UNSUPPORTED.has(q.kind))
  const chosen = questions ?? usable.map((q) => q.id)
  const toggle = (id) =>
    setQuestions(chosen.includes(id) ? chosen.filter((q) => q !== id) : [...chosen, id])
  return (
    <div className="space-y-3">
      <SelectField
        label="Asesmen"
        value={assessment}
        onChange={(event) => {
          setAssessment(event.target.value)
          setQuestions(null)
        }}
        options={toOptions(
          list,
          (a) =>
            `${a.title} — ${a.subject_name} ${a.classroom_name} (${a.question_count ?? 0} soal)`,
          assessments.loading ? 'Memuat...' : '- Pilih asesmen -',
        )}
        hint={
          !assessments.loading && list.length === 0 ? 'Belum ada asesmen di kelas Anda.' : undefined
        }
      />
      {assessment && detail.loading && <p className="text-sm text-slate-500">Memuat soal...</p>}
      {items.length > 0 && (
        <fieldset className="max-h-60 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
          <legend className="sr-only">Soal yang diambil</legend>
          {items.map((question, index) => {
            const disabled = UNSUPPORTED.has(question.kind)
            return (
              <label
                key={question.id}
                className={`flex items-start gap-2 rounded-md p-1.5 text-sm ${disabled ? 'text-slate-400' : 'text-slate-700 hover:bg-white'}`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-slate-300"
                  disabled={disabled}
                  checked={!disabled && chosen.includes(question.id)}
                  onChange={() => toggle(question.id)}
                />
                <span className="min-w-0">
                  <span className="font-semibold">{index + 1}.</span>{' '}
                  <span className="line-clamp-2">{question.text}</span>
                  {disabled && <span className="text-xs"> (esai/video belum didukung)</span>}
                </span>
              </label>
            )
          })}
        </fieldset>
      )}
    </div>
  )
}

function SourceInput({ state, set, mediaId }) {
  const { source } = state
  if (source === 'links') {
    return (
      <TextAreaField
        label="Tautan (satu per baris)"
        rows={6}
        value={state.text}
        onChange={(event) => set({ text: event.target.value })}
        placeholder={
          '# Video pengantar\nApa itu algoritma? | https://youtu.be/...\nhttps://flowgorithm.org'
        }
        hint='Format: "Judul | alamat" atau alamatnya saja. Baris diawali # = stasiun baru.'
      />
    )
  }
  if (source === 'bank') {
    return (
      <BankPicker
        assessment={state.assessment}
        setAssessment={(assessment) => set({ assessment })}
        questions={state.questions}
        setQuestions={(questions) => set({ questions })}
      />
    )
  }
  const rules = IMPORT_SOURCES[source]
  return (
    <div className="space-y-3">
      {source === 'excel' && (
        <FileDownloadButton
          fetchBlob={() => learningMediaApi.importTemplate(mediaId)}
          filename={`media-${mediaId}.xlsx`}
        >
          Unduh Template Excel
        </FileDownloadButton>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="import-file">
          File
        </label>
        <input
          id="import-file"
          type="file"
          accept={rules.accept}
          onChange={(event) => set({ file: event.target.files?.[0] ?? null })}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-800 hover:file:bg-brand-100"
        />
        <p className="mt-1 text-xs text-slate-500">Maksimal {rules.maxMb} MB.</p>
      </div>
    </div>
  )
}

function OutlinePreview({ outline }) {
  return (
    <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
      {outline.map((part, p) => (
        <div key={`${p}-${part.title}`}>
          <p className="font-semibold text-slate-900">{part.title}</p>
          {part.stations.map((station, s) => (
            <details key={`${s}-${station.title}`} className="ms-3 mt-1">
              <summary className="cursor-pointer text-slate-700">
                {station.title}{' '}
                <span className="text-xs text-slate-500">({station.steps.length} langkah)</span>
              </summary>
              <ol className="ms-5 mt-1 list-decimal space-y-0.5 text-xs text-slate-600">
                {station.steps.map((step, i) => (
                  <li key={i}>
                    <span className={step.graded ? 'font-semibold text-violet-800' : ''}>
                      {step.label}
                    </span>
                    {step.list !== 'steps' && (
                      <span className="text-slate-400">
                        {' '}
                        · {step.list === 'remedial' ? 'Belajar ulang' : 'Tantangan'}
                      </span>
                    )}
                    {step.caption && <span>: {step.caption}</span>}
                    {step.image && <span className="text-slate-400"> · gambar</span>}
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Wizard impor isi media: 1) pilih sumber & file, 2) Periksa (tidak ada yang disimpan), 3) Terapkan ke draf.
 * `preferReplace` = media baru berisi stasiun contoh saja, jadi bawaannya mengganti isi.
 * Draf harus sudah tersimpan (Studio menyimpannya dulu sebelum membuka wizard).
 * `onImported(hasil)` menerima respons server (berisi `media` dengan draf baru).
 */
export default function ImportMediaModal({
  mediaId,
  hasContent,
  preferReplace,
  onClose,
  onImported,
}) {
  const [state, setState] = useState({
    source: '',
    mode: 'append',
    file: null,
    text: '',
    assessment: '',
    questions: null,
  })
  const [step, setStep] = useState(0)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const set = (changes) => {
    setState((current) => ({ ...current, ...changes }))
    setError('')
  }

  const run = async (dryRun) => {
    const { data, error: invalid } = importPayload(state)
    if (invalid) {
      setError(invalid)
      return
    }
    setBusy(dryRun ? 'check' : 'apply')
    setError('')
    try {
      const result = await learningMediaApi.importContent(mediaId, data, dryRun, setProgress)
      if (dryRun) {
        setPreview(result)
        setStep(1)
      } else {
        onImported(result)
      }
    } catch (err) {
      const body = err.response?.data
      if (body?.outline) {
        setPreview(body)
        setStep(1)
      }
      const fields = getFieldErrors(err)
      setError(fields.file ?? fields.assessment ?? fields.text ?? getErrorMessage(err))
    } finally {
      setBusy('')
      setProgress(null)
    }
  }

  const ready = preview && preview.errors.length === 0
  const footer =
    step === 0 ? (
      <>
        <Button variant="secondary" onClick={onClose}>
          Batal
        </Button>
        <Button disabled={!state.source} loading={busy === 'check'} onClick={() => run(true)}>
          {busy === 'check' && progress !== null && progress < 100
            ? `Mengunggah ${progress}%`
            : 'Periksa'}
        </Button>
      </>
    ) : (
      <>
        <Button variant="secondary" onClick={() => setStep(0)}>
          Kembali
        </Button>
        <Button disabled={!ready} loading={busy === 'apply'} onClick={() => run(false)}>
          Terapkan ke Draf
        </Button>
      </>
    )

  return (
    <Modal open size="lg" title="Impor isi media" onClose={onClose} footer={footer}>
      <div className="space-y-4 text-sm">
        <Steps current={busy === 'apply' ? 2 : step} />
        {step === 0 && (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {SOURCES.map(({ id, icon: Icon, label, description }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={state.source === id}
                  onClick={() =>
                    set({
                      source: id,
                      file: null,
                      mode: preferReplace ? 'replace' : defaultImportMode(id, hasContent),
                    })
                  }
                  className={`flex items-start gap-3 rounded-lg p-3 text-left ring-1 ${
                    state.source === id
                      ? 'bg-brand-50 ring-2 ring-brand-600'
                      : 'bg-white ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-semibold text-slate-900">{label}</span>
                    <span className="block text-xs text-slate-600">{description}</span>
                  </span>
                </button>
              ))}
            </div>
            {state.source && (
              <div className="space-y-3 rounded-lg p-3 ring-1 ring-slate-200">
                <SourceInput state={state} set={set} mediaId={mediaId} />
                {hasContent && (
                  <fieldset className="space-y-1">
                    <legend className="mb-1 font-medium text-slate-700">Cara menerapkan</legend>
                    <label className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="import-mode"
                        className="mt-0.5"
                        checked={state.mode === 'append'}
                        onChange={() => set({ mode: 'append' })}
                      />
                      <span>
                        <strong>Tambahkan</strong> di belakang isi yang ada (bagian berjudul sama
                        digabung).
                      </span>
                    </label>
                    <label className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="import-mode"
                        className="mt-0.5"
                        checked={state.mode === 'replace'}
                        onChange={() => set({ mode: 'replace' })}
                      />
                      <span>
                        <strong>Ganti</strong> seluruh isi draf dengan isi file. Progres siswa tetap
                        aman untuk stasiun yang Id-nya sama (template Excel).
                      </span>
                    </label>
                  </fieldset>
                )}
              </div>
            )}
          </>
        )}

        {step === 1 && preview && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge color="gray">{preview.summary.parts} bagian</Badge>
              <Badge color="blue">{preview.summary.stations} stasiun</Badge>
              <Badge color="green">{preview.summary.steps} langkah</Badge>
              <Badge color="blue">{preview.summary.graded} latihan</Badge>
              {preview.summary.images > 0 && (
                <Badge color="amber">{preview.summary.images} gambar</Badge>
              )}
              <Badge color="gray">
                {preview.mode === 'replace' ? 'Mode: ganti' : 'Mode: tambahkan'}
              </Badge>
            </div>
            <MessageList
              type="error"
              title="Belum bisa diterapkan:"
              items={preview.errors}
              limit={20}
            />
            <MessageList type="warning" title="Perhatikan:" items={preview.warnings} />
            <MessageList
              type="warning"
              title="Stasiun berikut akan hilang dari draf (progres siswa yang sudah ada tidak terhapus):"
              items={preview.removed}
            />
            {preview.outline.length > 0 && <OutlinePreview outline={preview.outline} />}
            {ready && preview.problems.length > 0 && (
              <details className="rounded-lg bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200">
                <summary className="cursor-pointer font-semibold">
                  {preview.problems.length} hal perlu dilengkapi sebelum terbit (boleh diterapkan
                  dulu)
                </summary>
                <ul className="mt-1 list-disc space-y-0.5 ps-5 text-xs">
                  {preview.problems.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </details>
            )}
            {ready && (
              <p className="text-slate-600">
                Isi diterapkan ke <strong>draf</strong>. Periksa di Studio, lalu tekan Terbitkan
                agar terlihat siswa.
              </p>
            )}
          </>
        )}
        <Alert type="error">{error}</Alert>
      </div>
    </Modal>
  )
}
