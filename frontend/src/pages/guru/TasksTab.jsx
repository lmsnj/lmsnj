import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { tasksApi } from '../../api/tasks'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import TaskList from '../../components/TaskList'
import useFetch from '../../hooks/useFetch'
import { ALL } from '../../utils/academic'
import TaskFormModal from './TaskFormModal'

// Tab "Tugas" di halaman kelas-mapel guru.
export default function TasksTab({ assignmentId }) {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const tasks = useFetch(tasksApi.list, { ...ALL, teaching_assignment: assignmentId })

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Klik tugas untuk melihat siapa saja yang sudah mengumpulkan.
        </p>
        <Button onClick={() => setCreating(true)}>+ Buat Tugas</Button>
      </div>
      <Alert type="error">{tasks.error}</Alert>
      <TaskList
        tasks={tasks.data?.results}
        loading={tasks.loading}
        forTeacher
        linkTo={(task) => `/guru/tugas/${task.id}`}
        emptyTitle="Belum ada tugas. Klik “Buat Tugas” untuk mulai."
      />
      {creating && (
        <TaskFormModal
          assignmentId={assignmentId}
          onClose={() => setCreating(false)}
          onSaved={(saved) => navigate(`/guru/tugas/${saved.id}`)}
        />
      )}
    </>
  )
}
