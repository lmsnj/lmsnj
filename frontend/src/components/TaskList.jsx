import { Link } from 'react-router-dom'
import { formatDate } from '../utils/media'
import { dueLabel, studentTaskStatus } from '../utils/tasks'
import Badge from './Badge'
import EmptyState from './EmptyState'
import Spinner from './Spinner'

/**
 * Daftar tugas. `linkTo(task)` menentukan halaman detail.
 * forTeacher: tampilkan status Draf/Terbit, jumlah pengumpulan, dan yang perlu dinilai.
 * showContext: tampilkan mapel & kelas (untuk daftar gabungan semua kelas).
 * Selain itu: tampilkan status pengumpulan milik siswa.
 */
export default function TaskList({ tasks, loading, linkTo, forTeacher, showContext, emptyTitle }) {
  if (loading && !tasks?.length) {
    return (
      <div className="py-10 text-center text-brand-600">
        <Spinner />
      </div>
    )
  }
  if (!tasks?.length) return <EmptyState title={emptyTitle ?? 'Belum ada tugas'} />

  return (
    <ul className="space-y-3">
      {tasks.map((task) => {
        const status = forTeacher ? null : studentTaskStatus(task)
        return (
          <li key={task.id}>
            <Link
              to={linkTo(task)}
              className="block rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md hover:ring-brand-600"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium text-slate-900">{task.title}</p>
                {forTeacher ? (
                  <Badge color={task.is_published ? 'green' : 'amber'}>
                    {task.is_published ? 'Terbit' : 'Draf'}
                  </Badge>
                ) : (
                  <Badge color={status.color}>{status.label}</Badge>
                )}
              </div>
              <p
                className={`mt-1 text-sm ${task.is_past_due ? 'text-slate-500' : 'text-slate-700'}`}
              >
                Tenggat: {formatDate(task.due_at)}{' '}
                <span className="text-slate-500">({dueLabel(task.due_at)})</span>
              </p>
              {showContext && (
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {task.subject_name} · {task.classroom_name}
                </p>
              )}
              {forTeacher && (
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {task.submission_count} dari {task.student_count} siswa sudah mengumpulkan
                  {task.ungraded_count > 0 && (
                    <Badge color="amber">{task.ungraded_count} perlu dinilai</Badge>
                  )}
                </p>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
