import { ClipboardPen, MonitorPlay, QrCode, Smartphone } from 'lucide-react'
import { Link } from 'react-router-dom'
import { schoolSettingsApi } from '../api/schoolSettings'
import useFeature from '../hooks/useFeature'
import useFetch from '../hooks/useFetch'
import { SoonBadge } from './Dropdown'

// Alat kelas Mapel Umum. `path` = halaman di bawah /guru/kelas/:id (null = belum dibuat, "Segera").
const TOOLS = [
  {
    label: 'Presentasi',
    info: 'Tampilkan materi penuh di TV kelas.',
    icon: MonitorPlay,
    path: 'presentasi',
    feature: 'presentasi',
  },
  {
    label: 'Penilaian Langsung',
    info: 'Masukkan nilai tanpa pengumpulan siswa.',
    icon: ClipboardPen,
    path: 'penilaian',
    feature: 'penilaian_langsung',
  },
  {
    label: 'Kuis QR',
    info: 'Kuis satu kelas dengan kartu QR.',
    icon: QrCode,
    path: 'kuis-qr',
    feature: 'kuis_qr',
  },
]

const loadMode = ({ classroom, subject }) => schoolSettingsApi.effective({ classroom, subject })

function Tool({ tool, assignmentId, active }) {
  const body = (
    <>
      <tool.icon className="size-6 shrink-0 text-amber-700" aria-hidden="true" />
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {tool.label} {!active && <SoonBadge />}
        </p>
        <p className="text-xs text-slate-500">{tool.info}</p>
      </div>
    </>
  )
  const base = 'flex items-center gap-3 rounded-lg p-3 ring-1 ring-amber-200'
  if (!active) {
    return (
      <div title="Segera hadir" aria-disabled="true" className={`${base} bg-white/70 opacity-80`}>
        {body}
      </div>
    )
  }
  return (
    <Link
      to={`/guru/kelas/${assignmentId}/${tool.path}`}
      className={`${base} bg-white transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      {body}
    </Link>
  )
}

function ModePanel({ assignmentId, classroomId, subjectId, features }) {
  const settings = useFetch(loadMode, { classroom: classroomId, subject: subjectId })
  const mode = settings.data?.class_mode
  if (!settings.data) return null
  // Mode yang memakai perangkat siswa (mis. Lab): cukup tombol kecil untuk alat yang aktif.
  if (mode.needs_student_device) {
    return <QuickTools assignmentId={assignmentId} features={features} />
  }
  return (
    <section className="mb-6 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <div className="flex flex-wrap items-center gap-2">
        <Smartphone className="size-5 text-amber-700" aria-hidden="true" />
        <h2 className="font-semibold text-amber-900">Mode: {mode.name}</h2>
      </div>
      <p className="mt-1 text-sm text-amber-800">
        Siswa tidak memakai perangkat di kelas ini. Gunakan laptop/HP Anda dan TV kelas.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {TOOLS.map((tool) => (
          <Tool
            key={tool.label}
            tool={tool}
            assignmentId={assignmentId}
            active={Boolean(tool.path && features[tool.feature])}
          />
        ))}
      </div>
    </section>
  )
}

// Baris tombol kecil untuk alat yang sudah aktif (dipakai di kelas yang siswanya memakai perangkat).
function QuickTools({ assignmentId, features }) {
  const tools = TOOLS.filter((tool) => tool.path && features[tool.feature])
  if (tools.length === 0) return null
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {tools.map((tool) => (
        <Link
          key={tool.label}
          to={`/guru/kelas/${assignmentId}/${tool.path}`}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
        >
          <tool.icon className="size-4 text-brand-700" aria-hidden="true" />
          {tool.label}
        </Link>
      ))}
    </div>
  )
}

/**
 * Alat kelas Mapel Umum di Ringkasan kelas guru. Tidak tampil apa pun jika fitur-fiturnya mati:
 * - `mode_kelas` + mode tanpa perangkat siswa: panel kuning berisi alat (yang belum ada = "Segera");
 * - selain itu, alat yang fiturnya menyala (`presentasi`, `penilaian_langsung`, `kuis_qr`) tampil sebagai tombol kecil.
 */
export default function ClassModePanel({ assignmentId, classroomId, subjectId }) {
  const modeEnabled = useFeature('mode_kelas')
  const gradingEnabled = useFeature('penilaian_langsung')
  const presentationEnabled = useFeature('presentasi')
  const qrQuizEnabled = useFeature('kuis_qr')
  const features = {
    penilaian_langsung: gradingEnabled,
    presentasi: presentationEnabled,
    kuis_qr: qrQuizEnabled,
  }
  if (modeEnabled) {
    return (
      <ModePanel
        assignmentId={assignmentId}
        classroomId={classroomId}
        subjectId={subjectId}
        features={features}
      />
    )
  }
  return <QuickTools assignmentId={assignmentId} features={features} />
}
