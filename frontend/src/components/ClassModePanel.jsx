import { ClipboardPen, MonitorPlay, QrCode, Smartphone } from 'lucide-react'
import { schoolSettingsApi } from '../api/schoolSettings'
import useFeature from '../hooks/useFeature'
import useFetch from '../hooks/useFetch'
import { SoonBadge } from './Dropdown'

// Alat untuk kelas tanpa perangkat siswa. Akan diaktifkan di Tahap 3–5 (Mapel Umum).
const TOOLS = [
  { label: 'Presentasi', info: 'Tampilkan materi penuh di TV kelas.', icon: MonitorPlay },
  {
    label: 'Penilaian Langsung',
    info: 'Masukkan nilai tanpa pengumpulan siswa.',
    icon: ClipboardPen,
  },
  { label: 'Kuis QR', info: 'Kuis satu kelas dengan kartu QR.', icon: QrCode },
]

const loadMode = ({ classroom, subject }) => schoolSettingsApi.effective({ classroom, subject })

function Panel({ classroomId, subjectId }) {
  const settings = useFetch(loadMode, { classroom: classroomId, subject: subjectId })
  const mode = settings.data?.class_mode
  // Mode yang memakai perangkat siswa (mis. Lab) = tampilan kelas tetap seperti biasa.
  if (!mode || mode.needs_student_device) return null
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
          <div
            key={tool.label}
            title="Segera hadir"
            aria-disabled="true"
            className="flex items-center gap-3 rounded-lg bg-white/70 p-3 opacity-80 ring-1 ring-amber-200"
          >
            <tool.icon className="size-6 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                {tool.label} <SoonBadge />
              </p>
              <p className="text-xs text-slate-500">{tool.info}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * Lencana & alat mode kelas (Mapel Umum Tahap 2). Hanya tampil jika fitur `mode_kelas` menyala
 * di sekolah ini DAN mode kelas-mapel ini tidak memakai perangkat siswa; selain itu tidak ada
 * yang berubah di halaman kelas.
 */
export default function ClassModePanel({ classroomId, subjectId }) {
  const enabled = useFeature('mode_kelas')
  if (!enabled) return null
  return <Panel classroomId={classroomId} subjectId={subjectId} />
}
