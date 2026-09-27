import { CalendarClock, CalendarDays, Megaphone } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { tasksApi } from '../../api/tasks'
import useAuth from '../../hooks/useAuth'
import useFetch from '../../hooks/useFetch'
import { ROLES } from '../../utils/constants'
import { formatDate } from '../../utils/media'
import { dueLabel, studentTaskStatus } from '../../utils/tasks'
import Alert from '../Alert'
import Badge from '../Badge'
import { SoonBadge } from '../Dropdown'
import Spinner from '../Spinner'

const UPCOMING_DAYS = 14

const TABS = [
  { id: 'announcements', label: 'Papan Pengumuman', icon: Megaphone },
  { id: 'today', label: 'Tugas Hari Ini', icon: CalendarClock },
  { id: 'upcoming', label: 'Tugas Mendatang', icon: CalendarDays },
]

// Rentang waktu lokal (WIB di perangkat pengguna): hari ini, atau besok s.d. 14 hari ke depan.
function dueRange(tab) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  if (tab === 'today') {
    end.setDate(end.getDate() + 1)
  } else {
    start.setDate(start.getDate() + 1)
    end.setDate(end.getDate() + 1 + UPCOMING_DAYS)
  }
  end.setMilliseconds(-1)
  return { due_at__gte: start.toISOString(), due_at__lte: end.toISOString() }
}

const TASK_LINK = {
  [ROLES.TEACHER]: (task) => `/guru/tugas/${task.id}`,
  [ROLES.STUDENT]: (task) => `/siswa/tugas/${task.id}`,
}

function TaskRows({ tab }) {
  const { user } = useAuth()
  const tasks = useFetch(tasksApi.list, {
    ...dueRange(tab),
    is_published: true,
    ordering: 'due_at',
    page_size: 50,
  })

  if (tasks.error) return <Alert type="error">{tasks.error}</Alert>
  if (!tasks.data) {
    return (
      <div className="py-8 text-center text-brand-600">
        <Spinner />
      </div>
    )
  }
  const rows = tasks.data.results
  if (!rows.length) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        {tab === 'today'
          ? 'Tidak ada tugas dengan tenggat hari ini.'
          : `Tidak ada tugas dalam ${UPCOMING_DAYS} hari ke depan.`}
      </p>
    )
  }

  const linkTo = TASK_LINK[user.role]
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((task) => {
        const content = (
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">{task.title}</p>
              <p className="truncate text-xs text-slate-500">
                {task.subject_name} · {task.classroom_name} · {formatDate(task.due_at)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {user.role === ROLES.STUDENT ? (
                <Badge color={studentTaskStatus(task).color}>{studentTaskStatus(task).label}</Badge>
              ) : (
                <span className="text-sm text-slate-600">
                  <strong className="text-slate-900">{task.submission_count}</strong>/
                  {task.student_count} terkumpul
                </span>
              )}
              <p className="mt-0.5 text-xs text-slate-500">{dueLabel(task.due_at)}</p>
            </div>
          </div>
        )
        return (
          <li key={task.id}>
            {linkTo ? (
              <Link to={linkTo(task)} className="-mx-2 block rounded-lg px-2 hover:bg-slate-50">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        )
      })}
    </ul>
  )
}

// Panel putih bertab di bawah kartu Beranda. Data tugas diambil langsung dari API.
export default function HomePanel() {
  const [tab, setTab] = useState('today')

  return (
    <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold ${
              tab === item.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <item.icon className="size-4" aria-hidden="true" />
            {item.label}
            {item.id === 'announcements' && <SoonBadge />}
          </button>
        ))}
      </div>
      <div className="px-5 py-2">
        {tab === 'announcements' ? (
          <div className="py-8 text-center">
            <Megaphone className="mx-auto size-10 text-slate-300" aria-hidden="true" />
            <p className="mt-2 font-medium text-slate-700">Fitur pengumuman segera hadir</p>
            <p className="text-sm text-slate-500">
              Nantinya guru dan admin bisa menyampaikan pengumuman di sini.
            </p>
          </div>
        ) : (
          <TaskRows key={tab} tab={tab} />
        )}
      </div>
    </section>
  )
}
