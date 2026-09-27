import { useState } from 'react'
import { tasksApi } from '../../api/tasks'
import Alert from '../../components/Alert'
import AssignmentSelect from '../../components/AssignmentSelect'
import PageHeader from '../../components/PageHeader'
import TaskList from '../../components/TaskList'
import useFetch from '../../hooks/useFetch'
import useQueryFlag from '../../hooks/useQueryFlag'
import { ALL } from '../../utils/academic'
import { canSubmit } from '../../utils/tasks'

const FILTERS = [
  { id: 'semua', label: 'Semua', match: () => true },
  // Belum dikumpulkan dan masih bisa dikumpulkan (aturan sama dengan backend).
  { id: 'belum', label: 'Belum dikumpulkan', match: (t) => !t.my_submission && canSubmit(t) },
  { id: 'sudah', label: 'Sudah dikumpulkan', match: (t) => Boolean(t.my_submission) },
  { id: 'dinilai', label: 'Sudah dinilai', match: (t) => t.my_submission?.score != null },
]

// "Tugas" siswa: semua tugas dari semua mapel, dengan filter status.
export default function StudentTasksPage() {
  const initialStatus = useQueryFlag('status')
  const [filter, setFilter] = useState(
    FILTERS.some((f) => f.id === initialStatus) ? initialStatus : 'semua',
  )
  const [assignment, setAssignment] = useState('')
  const tasks = useFetch(tasksApi.list, {
    ...ALL,
    teaching_assignment: assignment || undefined,
    ordering: 'due_at',
  })

  const active = FILTERS.find((f) => f.id === filter)
  const visible = tasks.data?.results.filter(active.match)

  return (
    <>
      <PageHeader title="Tugas" description="Tugas dari semua mata pelajaran di kelas Anda." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <AssignmentSelect
          value={assignment}
          onChange={setAssignment}
          placeholder="Semua mata pelajaran"
          optionLabel={(a) => a.subject_name}
          className="w-full sm:w-64"
          aria-label="Filter mata pelajaran"
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
        showContext={!assignment}
        linkTo={(task) => `/siswa/tugas/${task.id}`}
        emptyTitle={filter === 'belum' ? 'Semua tugas sudah dikumpulkan. 🎉' : 'Belum ada tugas.'}
      />
    </>
  )
}
