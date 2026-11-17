import {
  BadgeCheck,
  ChevronRight,
  Circle,
  CircleCheck,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Link2,
  ListChecks,
  Lock,
  PencilLine,
  PlayCircle,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { materialsApi } from '../api/materials'
import { getErrorMessage } from '../utils/errors'
import {
  countChecks,
  defaultModuleId,
  moduleActivities,
  progressStatus,
  toggleObjective,
} from '../utils/learningPath'
import Alert from './Alert'
import Badge from './Badge'
import MaterialViewer from './MaterialViewer'
import ObjectiveQuiz from './ObjectiveQuiz'
import ProgressBar from './ProgressBar'
import ReflectionBox from './ReflectionBox'

const CONTENT_ICONS = { video: PlayCircle, pdf: FileText, link: Link2 }
const TYPE_LABELS = { video: 'Video', pdf: 'PDF', link: 'Link' }
const KIND_ICONS = {
  quiz: PencilLine,
  objective: ListChecks,
  task: ClipboardList,
  assessment: ClipboardCheck,
  approval: BadgeCheck,
}

function DoneIcon({ done, className = '' }) {
  const Icon = done ? CircleCheck : Circle
  return (
    <Icon
      className={`size-5 shrink-0 ${done ? 'text-brand-600' : 'text-slate-300'} ${className}`}
      aria-hidden="true"
    />
  )
}

function SectionTitle({ children }) {
  return (
    <h4 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">{children}</h4>
  )
}

// Kartu satu materi di daftar "Modul Pembelajaran" (kolom kiri).
function ModuleCard({ material, selected, onSelect }) {
  const progress = material.progress
  const locked = progress?.locked
  const completed = progress?.completed
  const status = progressStatus(progress)
  const activityCount = moduleActivities(material).length
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={`flex w-full items-start gap-3 rounded-xl p-4 text-left ring-1 transition ${
          selected
            ? 'bg-brand-50 ring-2 ring-brand-500'
            : 'bg-white ring-slate-200 hover:bg-slate-50'
        }`}
      >
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            locked
              ? 'bg-slate-200 text-slate-500'
              : completed
                ? 'bg-brand-600 text-white'
                : 'bg-brand-100 text-brand-800'
          }`}
        >
          {locked ? (
            <Lock className="size-4" aria-hidden="true" />
          ) : completed ? (
            <CircleCheck className="size-5" aria-hidden="true" />
          ) : (
            progress?.order_number
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-slate-500">Materi {progress?.order_number}</span>
          <span
            className={`mt-0.5 block font-semibold ${locked ? 'text-slate-500' : 'text-slate-900'}`}
          >
            {material.title}
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            {TYPE_LABELS[material.material_type]} &middot; {activityCount} aktivitas
          </span>
          {status && (
            <span className="mt-2 block">
              <Badge color={status.color}>{status.label}</Badge>
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

// Satu baris aktivitas: tanda selesai + ikon jenis + judul (tombol/tautan bila bisa dikerjakan).
function ActivityRow({ done, icon: Icon, children }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <DoneIcon done={done} className="mt-0.5" />
      <Icon className="mt-0.5 size-5 shrink-0 text-slate-600" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">{children}</div>
      <span className="sr-only">{done ? '(sudah)' : '(belum)'}</span>
    </li>
  )
}

const linkClass = 'text-left font-medium text-brand-700 hover:underline'

function ActivityList({ material, onChange, onOpenContent }) {
  const [quizOpen, setQuizOpen] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const checked = material.progress.checked_objectives

  const toggle = async (index) => {
    setSaving(true)
    setError('')
    try {
      onChange(await materialsApi.checkObjectives(material.id, toggleObjective(checked, index)))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Alert type="error">{error}</Alert>
      <ul className="divide-y divide-slate-100">
        {moduleActivities(material).map((item) => {
          if (item.kind === 'content') {
            return (
              <ActivityRow
                key={item.key}
                done={item.done}
                icon={CONTENT_ICONS[material.material_type]}
              >
                <button type="button" onClick={onOpenContent} className={linkClass}>
                  {item.label}: {material.title}
                </button>
              </ActivityRow>
            )
          }
          if (item.kind === 'quiz') {
            return (
              <ActivityRow key={item.key} done={item.done} icon={KIND_ICONS.quiz}>
                {item.done ? (
                  <span className="text-slate-800">
                    {item.label}{' '}
                    <span className="ml-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">
                      Lulus
                    </span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setQuizOpen(quizOpen === item.index ? null : item.index)}
                    className={linkClass}
                    aria-expanded={quizOpen === item.index}
                  >
                    {item.label} ({item.quizCount} soal)
                  </button>
                )}
                {quizOpen === item.index && (
                  <div className="mt-2">
                    <ObjectiveQuiz
                      material={material}
                      index={item.index}
                      onPassed={(updated) => {
                        setQuizOpen(null)
                        onChange(updated)
                      }}
                      onClose={() => setQuizOpen(null)}
                    />
                  </div>
                )}
              </ActivityRow>
            )
          }
          if (item.kind === 'objective') {
            return (
              <ActivityRow key={item.key} done={item.done} icon={KIND_ICONS.objective}>
                <label className="flex cursor-pointer items-start gap-2 text-slate-800">
                  <input
                    type="checkbox"
                    checked={item.done}
                    disabled={saving}
                    onChange={() => toggle(item.index)}
                    className="mt-0.5 size-4 rounded text-brand-600"
                  />
                  <span>
                    Saya sudah menguasai: <strong className="font-medium">{item.label}</strong>
                  </span>
                </label>
              </ActivityRow>
            )
          }
          const to =
            item.kind === 'task'
              ? `/siswa/tugas/${material.required_task}`
              : item.kind === 'assessment'
                ? `/siswa/asesmen/${material.required_assessment}`
                : null
          return (
            <ActivityRow key={item.key} done={item.done} icon={KIND_ICONS[item.kind]}>
              {to ? (
                <Link to={to} className={linkClass}>
                  {item.label}
                </Link>
              ) : (
                <span className="text-slate-800">
                  {item.label}
                  {!item.done && (
                    <span className="ml-1 text-xs text-slate-500">(menunggu guru)</span>
                  )}
                </span>
              )}
            </ActivityRow>
          )
        })}
      </ul>
    </>
  )
}

// Isi kolom kanan: judul materi, kemajuan, daftar aktivitas, dan cerita reflektif.
function ModuleDetail({ material, next, onChange, onSelect }) {
  const [viewing, setViewing] = useState(false)
  const progress = material.progress
  const { done, total } = countChecks(progress.checks)
  const reflectionCheck = progress.checks.find((check) => check.key === 'reflection')

  if (progress.locked) {
    return (
      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs text-slate-500">Materi {progress.order_number}</p>
        <h3 className="mt-1 text-xl font-bold text-slate-900">{material.title}</h3>
        <div className="mt-4 flex items-start gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <Lock className="mt-0.5 size-5 shrink-0 text-slate-500" aria-hidden="true" />
          <p className="text-sm text-slate-700">
            Materi ini masih terkunci. Selesaikan dulu semua aktivitas materi{' '}
            <strong>&ldquo;{progress.locked_by}&rdquo;</strong>, lalu materi ini terbuka otomatis.
          </p>
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs text-slate-500">Materi {progress.order_number}</p>
        <h3 className="mt-1 text-xl font-bold text-slate-900">{material.title}</h3>
        {material.description && (
          <p className="mt-2 text-sm whitespace-pre-line text-slate-700">{material.description}</p>
        )}
        <ProgressBar
          className="mt-4"
          value={done}
          max={total}
          label={
            progress.completed
              ? 'Semua aktivitas selesai'
              : `${done} dari ${total} syarat terpenuhi`
          }
        />
        {progress.unlocked && (
          <p className="mt-2 text-xs text-slate-600">
            Ditandai tercapai oleh guru{progress.note ? `: ${progress.note}` : '.'}
          </p>
        )}
      </section>

      <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
          <DoneIcon done={progress.completed} className="size-6" />
          <h3 className="font-semibold text-slate-900">Daftar Aktivitas</h3>
        </div>
        <div className="space-y-5 px-5 py-4">
          <div>
            <SectionTitle>Aktivitas</SectionTitle>
            <div className="mt-1">
              <ActivityList
                material={material}
                onChange={onChange}
                onOpenContent={() => setViewing(true)}
              />
            </div>
          </div>
          <div>
            <SectionTitle>
              Cerita Reflektif{' '}
              {!material.require_reflection && (
                <span className="font-normal tracking-normal normal-case">(opsional)</span>
              )}
            </SectionTitle>
            <div className="mt-2 flex items-start gap-3">
              <DoneIcon done={Boolean(progress.reflection)} className="mt-7" />
              <div className="min-w-0 flex-1">
                {/* key: isi kotak diatur ulang saat pindah materi. */}
                <ReflectionBox key={material.id} material={material} onSaved={onChange} />
              </div>
            </div>
            {reflectionCheck && !reflectionCheck.done && (
              <p className="mt-2 text-xs text-slate-500">
                Refleksi wajib ditulis agar materi berikutnya terbuka.
              </p>
            )}
          </div>
        </div>
      </section>

      {progress.completed && next && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-50 p-4 ring-1 ring-brand-200">
          <p className="text-sm text-brand-900">
            Materi ini tercapai. Lanjutkan ke <strong>{next.title}</strong>.
          </p>
          <button
            type="button"
            onClick={() => onSelect(next.id)}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Materi Berikutnya <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </section>
      )}

      {viewing && (
        <MaterialViewer
          material={material}
          contentOnly
          onClose={() => setViewing(false)}
          onChange={onChange}
        />
      )}
    </div>
  )
}

/**
 * Tampilan modul materi satu kelas-mapel untuk siswa: kolom kiri "Yang akan dipelajari" + daftar
 * materi berurutan (terkunci/tercapai), kolom kanan aktivitas materi terpilih + cerita reflektif.
 * Aturan kunci & syarat tetap dari backend (`material.progress`); `onChange` dipanggil setelah
 * progres berubah agar daftar dimuat ulang.
 */
export default function MaterialModule({ materials, onChange }) {
  const [selectedId, setSelectedId] = useState(null)
  // Materi terbaru dari respons aksi (sebelum daftar selesai dimuat ulang).
  const [latest, setLatest] = useState(null)
  const listed = materials.map((m) => (latest?.id === m.id ? { ...m, ...latest } : m))
  const currentId = selectedId ?? defaultModuleId(listed)
  const index = listed.findIndex((m) => m.id === currentId)
  const material = listed[index] ?? listed[0]
  const next = listed[index + 1]

  const select = (id) => {
    setSelectedId(id)
    setLatest(null)
    // Di HP detail ada di bawah daftar; gulir agar langsung terlihat.
    if (window.innerWidth < 1024) {
      document.getElementById('detail-materi')?.scrollIntoView({ behavior: 'smooth' })
    }
  }
  const handleChange = (updated) => {
    setLatest(updated)
    onChange?.(updated)
  }

  if (!material) return null
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <aside className="space-y-5">
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h3 className="font-semibold text-slate-900">Yang akan dipelajari</h3>
          {material.objectives?.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {material.objectives.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              Guru belum menuliskan capaian untuk materi ini.
            </p>
          )}
        </section>
        <section>
          <h3 className="font-semibold text-slate-900">Modul Pembelajaran</h3>
          <p className="text-sm text-slate-500">Pelajari materi sesuai urutan.</p>
          <ul className="mt-3 space-y-3">
            {listed.map((m) => (
              <ModuleCard
                key={m.id}
                material={m}
                selected={m.id === material.id}
                onSelect={() => select(m.id)}
              />
            ))}
          </ul>
        </section>
      </aside>
      <div id="detail-materi" className="scroll-mt-20">
        <ModuleDetail material={material} next={next} onChange={handleChange} onSelect={select} />
      </div>
    </div>
  )
}
