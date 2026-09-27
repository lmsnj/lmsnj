import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { tasksApi } from '../../api/tasks'
import Alert from '../../components/Alert'
import AssignmentSelect from '../../components/AssignmentSelect'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import TaskList from '../../components/TaskList'
import useFetch from '../../hooks/useFetch'
import useQueryFlag from '../../hooks/useQueryFlag'
import { ALL } from '../../utils/academic'
import TaskFormModal from './TaskFormModal'

const FILTERS = [
  { id: 'semua', label: 'Semua', match: () => true },
  { id: 'perlu-dinilai', label: 'Perlu dinilai', match: (t) => t.ungraded_count > 0 },
  { id: 'aktif', label: 'Belum lewat tenggat', match: (t) => t.is_published && !t.is_past_due },
  { id: 'draf', label: 'Draf', match: (t) => !t.is_published },
]

// "Tugas & Nilai": semua tugas guru dari semua kelas, dengan filter cepat.
export default function TeacherTasksPage() {
  const navigate = useNavigate()
  const initialFilter = useQueryFlag('filter')
  const openForm = useQueryFlag('baru') === '1'
  const [creating, setCreating] = useState(openForm)
  const [assignment, setAssignment] = useState('')
  const [filter, setFilter] = useState(
    FILTERS.some((f) => f.id === initialFilter) ? initialFilter : 'semua',
  )
  const tasks = useFetch(tasksApi.list, { ...ALL, teaching_assignment: assignment || undefined })

  const active = FILTERS.find((f) => f.id === filter)
  const visible = tasks.data?.results.filter(active.match)

  return (
    <>
      <PageHeader
        title="Tugas & Nilai"
        description="Klik tugas untuk melihat pengumpulan siswa dan memberi nilai."
        actions={<Button onClick={() => setCreating(true)}>+ Bagikan Tugas</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <AssignmentSelect
          value={assignment}
          onChange={setAssignment}
          className="w-full sm:w-72"
          aria-label="Filter kelas & mapel"
        />
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="group">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`rounded-md px-3 py-1 text-sm ${
                filter === f.id ? 'bg-white font-medium shadow-sm' : 'text-slate-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Alert type="error">{tasks.error}</Alert>
      <TaskList
        tasks={visible}
        loading={tasks.loading}
        forTeacher
        showContext={!assignment}
        linkTo={(task) => `/guru/tugas/${task.id}`}
        emptyTitle={
          filter === 'perlu-dinilai'
            ? 'Semua jawaban sudah dinilai. 🎉'
            : 'Belum ada tugas. Klik “Bagikan Tugas” untuk mulai.'
        }
      />

      {creating && (
        <TaskFormModal
          assignmentId={assignment}
          onClose={() => setCreating(false)}
          onSaved={(saved) => navigate(`/guru/tugas/${saved.id}`)}
        />
      )}
    </>
  )
}
