import {
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  ClipboardPen,
  ClipboardX,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatDate } from '../utils/media'
import { dueLabel, studentTaskStatus } from '../utils/tasks'
import Badge from './Badge'
import EmptyState from './EmptyState'
import ProgressBar from './ProgressBar'
import Spinner from './Spinner'

// Kotak ikon kartu tugas sesuai keadaannya.
function taskIcon(task, forTeacher) {
  if (forTeacher) {
    if (!task.is_published) return { icon: ClipboardPen, tile: 'bg-slate-100 text-slate-600' }
    if (task.ungraded_count > 0) return { icon: ClipboardList, tile: 'bg-amber-100 text-amber-700' }
    return { icon: ClipboardCheck, tile: 'bg-brand-100 text-brand-700' }
  }
  const status = studentTaskStatus(task)
  if (status.color === 'green') return { icon: ClipboardCheck, tile: 'bg-brand-100 text-brand-700' }
  if (status.color === 'red') return { icon: ClipboardX, tile: 'bg-red-100 text-red-600' }
  if (status.color === 'amber') return { icon: ClipboardList, tile: 'bg-amber-100 text-amber-700' }
  return { icon: ClipboardList, tile: 'bg-blue-100 text-blue-600' }
}

/**
 * Daftar tugas. `linkTo(task)` menentukan halaman detail.
 * forTeacher: tampilkan status Draf/Terbit, jumlah pengumpulan, dan yang perlu dinilai.
 * showContext: tampilkan mapel & kelas (untuk daftar gabungan semua kelas).
 * Selain itu: tampilkan status pengumpulan milik siswa.
 */
export default function TaskList({
  tasks,
  loading,
  linkTo,
  forTeacher,
  showContext,
  emptyTitle,
  emptyMessage,
}) {
  if (loading && !tasks?.length) {
    return (
      <div className="py-10 text-center text-brand-600">
        <Spinner />
      </div>
    )
  }
  if (!tasks?.length) {
    return <EmptyState title={emptyTitle ?? 'Belum ada tugas'}>{emptyMessage}</EmptyState>
  }

  return (
    <ul className="space-y-3">
      {tasks.map((task) => {
        const status = forTeacher ? null : studentTaskStatus(task)
        const { icon: Icon, tile } = taskIcon(task, forTeacher)
        return (
          <li key={task.id}>
            <Link
              to={linkTo(task)}
              className="group flex items-start gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md hover:ring-brand-300"
            >
              <span
                className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${tile}`}
              >
                <Icon className="size-6" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-semibold text-slate-900 group-hover:text-brand-700">
                    {task.title}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {forTeacher && task.ungraded_count > 0 && (
                      <Badge color="amber">{task.ungraded_count} perlu dinilai</Badge>
                    )}
                    {forTeacher ? (
                      <Badge color={task.is_published ? 'green' : 'gray'}>
                        {task.is_published ? 'Terbit' : 'Draf'}
                      </Badge>
                    ) : (
                      <Badge color={status.color}>{status.label}</Badge>
                    )}
                  </span>
                </span>
                {showContext && (
                  <span className="mt-0.5 block text-xs font-medium text-slate-500">
                    {task.subject_name} · {task.classroom_name}
                  </span>
                )}
                <span
                  className={`mt-1.5 flex items-center gap-1.5 text-sm ${
                    task.is_past_due ? 'text-slate-500' : 'text-slate-700'
                  }`}
                >
                  <CalendarClock className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
                  Tenggat {formatDate(task.due_at)}
                  <span className="text-slate-500">({dueLabel(task.due_at)})</span>
                </span>
                {forTeacher && task.is_published && (
                  <ProgressBar
                    className="mt-3 max-w-sm"
                    value={task.submission_count}
                    max={task.student_count}
                    label={`${task.submission_count} dari ${task.student_count} siswa mengumpulkan`}
                  />
                )}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
