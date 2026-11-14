import { Circle, CircleCheck, Lock, Target } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { materialsApi } from '../api/materials'
import { getErrorMessage } from '../utils/errors'
import { countChecks, toggleObjective } from '../utils/learningPath'
import { saveBlob, youtubeEmbedUrl } from '../utils/media'
import Alert from './Alert'
import Button from './Button'
import Modal from './Modal'
import ObjectiveQuiz from './ObjectiveQuiz'
import Spinner from './Spinner'

function PdfViewer({ material }) {
  const [state, setState] = useState({ blobUrl: null, error: '' })

  useEffect(() => {
    let blobUrl = null
    let ignore = false
    materialsApi
      .download(material.id)
      .then((blob) => {
        blobUrl = URL.createObjectURL(blob)
        if (ignore) URL.revokeObjectURL(blobUrl)
        else setState({ blobUrl, error: '' })
      })
      .catch(() => !ignore && setState({ blobUrl: null, error: 'Gagal memuat file PDF.' }))
    return () => {
      ignore = true
      // Bebaskan memori browser saat penampil ditutup.
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [material.id])

  if (state.error) return <Alert type="error">{state.error}</Alert>
  if (!state.blobUrl) {
    return (
      <div className="py-16 text-center text-brand-600">
        <Spinner className="size-8" />
        <p className="mt-2 text-sm text-slate-500">Memuat PDF...</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => window.open(state.blobUrl, '_blank', 'noopener')}>
          Buka di Tab Baru
        </Button>
        <Button
          variant="secondary"
          onClick={() => saveBlob(state.blobUrl, material.original_filename || 'materi.pdf')}
        >
          Unduh
        </Button>
      </div>
      {/* Beberapa browser HP tidak bisa menampilkan PDF di dalam halaman; gunakan tombol di atas. */}
      <iframe
        src={state.blobUrl}
        title={material.title}
        className="hidden h-[65vh] w-full rounded-lg ring-1 ring-slate-200 sm:block"
      />
    </div>
  )
}

function ExternalLink({ url, label }) {
  return (
    <div className="space-y-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        {label}
      </a>
      <p className="text-xs break-all text-slate-500">{url}</p>
    </div>
  )
}

function VideoViewer({ material }) {
  const embedUrl = youtubeEmbedUrl(material.url)
  if (!embedUrl) return <ExternalLink url={material.url} label="Tonton Video" />
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
      <iframe
        src={embedUrl}
        title={material.title}
        className="h-full w-full"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  )
}

// Tautan ke tugas/asesmen yang menjadi syarat (khusus siswa).
function checkLink(material, check) {
  if (check.key === 'task' && material.required_task)
    return `/siswa/tugas/${material.required_task}`
  if (check.key === 'assessment' && material.required_assessment) {
    return `/siswa/asesmen/${material.required_assessment}`
  }
  return null
}

// Syarat capaian versi guru (tanpa progres): daftar capaian & syarat yang dipilih.
function TeacherRequirements({ material }) {
  const [preview, setPreview] = useState(null)
  const quizCounts = material.objective_quiz ?? []
  const items = []
  if (material.required_task_title) {
    items.push(
      material.min_task_score !== null
        ? `Nilai tugas "${material.required_task_title}" minimal ${material.min_task_score}`
        : `Mengumpulkan tugas "${material.required_task_title}"`,
    )
  }
  if (material.required_assessment_title) {
    items.push(`Tuntas asesmen "${material.required_assessment_title}"`)
  }
  if (material.require_teacher_approval) items.push('Disahkan guru')
  if (!material.objectives?.length && !items.length) return null
  return (
    <section className="rounded-xl bg-sky-50 p-4 ring-1 ring-sky-200">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-sky-900">
        <Target className="size-4" aria-hidden="true" /> Capaian & syarat lanjut
      </h3>
      {material.objectives?.length > 0 && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          {material.objectives.map((text, index) => (
            <li key={text}>
              {text}
              {quizCounts[index] > 0 && (
                <button
                  type="button"
                  onClick={() => setPreview(preview === index ? null : index)}
                  className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800 hover:bg-sky-200"
                >
                  Kuis {quizCounts[index]} soal &middot; {preview === index ? 'Tutup' : 'Coba'}
                </button>
              )}
              {preview === index && (
                <div className="mt-2">
                  <ObjectiveQuiz
                    material={material}
                    index={index}
                    preview
                    onClose={() => setPreview(null)}
                  />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {items.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
          {items.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

// Panel capaian untuk siswa: centang capaian + status setiap syarat.
function LearningPanel({ material, onChange }) {
  const progress = material.progress
  const [saving, setSaving] = useState(null)
  const [error, setError] = useState('')
  const [quizOpen, setQuizOpen] = useState(null)
  const quizCounts = material.objective_quiz ?? []
  const { done, total } = countChecks(progress.checks)

  const toggle = async (index) => {
    setSaving(index)
    setError('')
    try {
      const checked = toggleObjective(progress.checked_objectives, index)
      onChange(await materialsApi.checkObjectives(material.id, checked))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(null)
    }
  }

  return (
    <section className="rounded-xl bg-sky-50 p-4 ring-1 ring-sky-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-sky-900">
          <Target className="size-4" aria-hidden="true" /> Capaian Pembelajaran
        </h3>
        <span
          className={`text-xs font-semibold ${progress.completed ? 'text-brand-700' : 'text-sky-800'}`}
        >
          {progress.completed ? 'Tercapai, materi berikutnya terbuka' : `${done}/${total} syarat`}
        </span>
      </div>
      <Alert type="error" className="mt-2">
        {error}
      </Alert>
      {material.objectives?.length > 0 && (
        <fieldset className="mt-3">
          <legend className="text-xs text-slate-600">
            {quizCounts.some(Boolean)
              ? 'Capaian bertombol “Uji” tercapai setelah kuisnya dijawab benar semua; capaian lain dicentang sendiri (jujur pada diri sendiri):'
              : 'Centang capaian yang sudah Anda kuasai (jujur pada diri sendiri):'}
          </legend>
          <ul className="mt-1 space-y-1">
            {material.objectives.map((text, index) => {
              const checked = progress.checked_objectives.includes(index)
              if (!quizCounts[index]) {
                return (
                  <li key={index}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-white p-2 text-sm text-slate-800 ring-1 ring-slate-200">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={saving !== null}
                        onChange={() => toggle(index)}
                        className="mt-0.5 size-4 rounded text-brand-600"
                      />
                      {text}
                    </label>
                  </li>
                )
              }
              const Icon = checked ? CircleCheck : Circle
              return (
                <li key={index} className="space-y-2">
                  <div className="flex items-start gap-2 rounded-lg bg-white p-2 text-sm text-slate-800 ring-1 ring-slate-200">
                    <Icon
                      className={`mt-0.5 size-4 shrink-0 ${checked ? 'text-brand-600' : 'text-slate-400'}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">{text}</span>
                    {checked ? (
                      <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">
                        Lulus
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant={quizOpen === index ? 'secondary' : 'primary'}
                        onClick={() => setQuizOpen(quizOpen === index ? null : index)}
                      >
                        Uji ({quizCounts[index]} soal)
                      </Button>
                    )}
                  </div>
                  {quizOpen === index && (
                    <ObjectiveQuiz
                      material={material}
                      index={index}
                      onPassed={onChange}
                      onClose={() => setQuizOpen(null)}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        </fieldset>
      )}
      <ul className="mt-3 space-y-1 text-sm">
        {progress.checks.map((check) => {
          const Icon = check.done ? CircleCheck : Circle
          const to = checkLink(material, check)
          return (
            <li key={check.key} className="flex items-center gap-2">
              <Icon
                className={`size-4 shrink-0 ${check.done ? 'text-brand-600' : 'text-slate-400'}`}
                aria-hidden="true"
              />
              <span className={check.done ? 'text-slate-700' : 'text-slate-900'}>
                {check.label}
                <span className="sr-only">{check.done ? ' (sudah)' : ' (belum)'}</span>
              </span>
              {to && !check.done && (
                <Link to={to} className="text-xs font-medium text-brand-700 underline">
                  Kerjakan
                </Link>
              )}
            </li>
          )
        })}
      </ul>
      {progress.unlocked && (
        <p className="mt-2 text-xs text-slate-600">
          Ditandai tercapai oleh guru{progress.note ? `: ${progress.note}` : '.'}
        </p>
      )}
    </section>
  )
}

function LockedNotice({ material }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <Lock className="mt-0.5 size-5 shrink-0 text-slate-500" aria-hidden="true" />
        <p className="text-sm text-slate-700">
          Materi ini masih terkunci. Selesaikan dulu capaian materi{' '}
          <strong>&ldquo;{material.progress.locked_by}&rdquo;</strong>, lalu materi ini terbuka
          otomatis.
        </p>
      </div>
      {material.objectives?.length > 0 && (
        <div className="text-sm text-slate-600">
          <p className="font-medium text-slate-700">Yang akan Anda capai di materi ini:</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            {material.objectives.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

/**
 * Penampil materi dalam modal. Dipakai guru maupun siswa. Untuk siswa (`material.progress` ada),
 * materi otomatis ditandai "dibuka" dan panel capaian ditampilkan; `onChange(materiTerbaru)`
 * dipanggil setiap progres berubah agar daftar ikut diperbarui.
 */
export default function MaterialViewer({ material, onClose, onChange }) {
  const progress = material?.progress
  const needsOpen = Boolean(progress && !progress.locked && !progress.opened)
  const materialId = material?.id
  // Simpan onChange terbaru tanpa memicu efek ulang (fungsi baru setiap render), seperti useFetch.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  const notify = (updated) => onChangeRef.current?.(updated)

  useEffect(() => {
    if (!needsOpen) return
    let ignore = false
    materialsApi
      .open(materialId)
      .then((updated) => !ignore && onChangeRef.current?.(updated))
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [materialId, needsOpen])

  if (!material) return null
  if (progress?.locked) {
    return (
      <Modal open title={material.title} onClose={onClose}>
        <LockedNotice material={material} />
      </Modal>
    )
  }
  return (
    <Modal open title={material.title} onClose={onClose} size="lg">
      <div className="space-y-4">
        {material.description && (
          <p className="text-sm whitespace-pre-line text-slate-700">{material.description}</p>
        )}
        {material.material_type === 'pdf' && <PdfViewer material={material} />}
        {material.material_type === 'video' && <VideoViewer material={material} />}
        {material.material_type === 'link' && (
          <ExternalLink url={material.url} label="Buka Link Materi" />
        )}
        {progress ? (
          <LearningPanel material={material} onChange={notify} />
        ) : (
          <TeacherRequirements material={material} />
        )}
      </div>
    </Modal>
  )
}
