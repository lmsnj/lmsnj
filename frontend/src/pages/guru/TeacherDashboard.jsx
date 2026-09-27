import { CalendarClock, ClipboardList, FilePenLine, School, Star, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { dashboardApi } from '../../api/dashboard'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import {
  DashboardState,
  Panel,
  PanelItem,
  StatCard,
  StatGrid,
  SummaryHeading,
} from '../../components/Dashboard'
import HomeTop from '../../components/home/HomeTop'
import useScrollToHash from '../../hooks/useScrollToHash'
import { HOME_CARDS } from '../home/cards'
import useFetch from '../../hooks/useFetch'
import { ROLES } from '../../utils/constants'
import { formatDate } from '../../utils/media'
import { dueLabel } from '../../utils/tasks'

export default function TeacherDashboard() {
  const { data, error } = useFetch(dashboardApi.get)
  useScrollToHash(Boolean(data))
  return (
    <>
      <HomeTop
        cards={HOME_CARDS[ROLES.TEACHER]}
        stats={
          data
            ? [
                {
                  icon: Star,
                  content: (
                    <>
                      <strong className="text-white">{data.stats.to_grade} jawaban</strong> menunggu
                      dinilai
                    </>
                  ),
                },
              ]
            : []
        }
      />
      <SummaryHeading />
      <DashboardState loading={!data} error={error}>
        {data && <TeacherContent data={data} />}
      </DashboardState>
    </>
  )
}

function TeacherContent({ data }) {
  const { stats } = data
  const moreToGrade = stats.to_grade - data.to_grade.length

  return (
    <>
      {data.homeroom_classes.length > 0 && (
        <Alert type="info" className="mb-4">
          Anda wali kelas: <strong>{data.homeroom_classes.join(', ')}</strong>
        </Alert>
      )}

      <StatGrid>
        <StatCard
          label="Kelas diampu"
          icon={School}
          tone="brand"
          value={stats.teaching_assignments}
          to="/guru/kelas"
        />
        <StatCard
          label="Perlu dinilai"
          icon={Star}
          to="/guru/tugas?filter=perlu-dinilai"
          value={stats.to_grade}
          tone={stats.to_grade ? 'amber' : 'default'}
          hint="jawaban siswa"
        />
        <StatCard
          label="Tugas aktif"
          icon={ClipboardList}
          tone="blue"
          value={stats.active_tasks}
          hint="belum lewat tenggat"
          to="/guru/tugas"
        />
        <StatCard
          label="Draf"
          icon={FilePenLine}
          value={stats.drafts}
          hint="materi & tugas belum terbit"
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Perlu dinilai"
          icon={Star}
          items={data.to_grade}
          empty="Tidak ada jawaban yang menunggu dinilai. 🎉"
          action={
            moreToGrade > 0 && <span className="text-xs text-slate-500">+{moreToGrade} lagi</span>
          }
        >
          {data.to_grade.map((item) => (
            <PanelItem
              key={item.submission_id}
              to={`/guru/tugas/${item.task_id}`}
              title={`${item.student_name} · ${item.task_title}`}
              meta={`${item.subject_name} · ${item.classroom_name} · ${formatDate(item.submitted_at)}`}
              aside={item.is_late && <Badge color="amber">Terlambat</Badge>}
            />
          ))}
        </Panel>

        <Panel
          title="Tenggat 7 hari ke depan"
          icon={CalendarClock}
          items={data.upcoming_tasks}
          empty="Tidak ada tugas yang tenggatnya dekat."
        >
          {data.upcoming_tasks.map((task) => (
            <PanelItem
              key={task.id}
              to={`/guru/tugas/${task.id}`}
              title={task.title}
              meta={`${task.subject_name} · ${task.classroom_name} · ${dueLabel(task.due_at)}`}
              aside={
                <span className="text-slate-600">
                  <strong className="text-slate-900">{task.submission_count}</strong>/
                  {task.student_count}
                  <span className="block text-xs text-slate-500">terkumpul</span>
                </span>
              }
            />
          ))}
        </Panel>

        <Panel
          title="Kelas saya"
          icon={Users}
          items={data.teaching_assignments}
          empty="Anda belum terdaftar sebagai pengampu. Hubungi admin."
          action={
            <Link to="/guru/kelas" className="text-sm text-brand-700 hover:underline">
              Semua →
            </Link>
          }
        >
          {data.teaching_assignments.map((a) => (
            <PanelItem
              key={a.id}
              to={`/guru/kelas/${a.id}`}
              title={a.subject_name}
              meta={a.classroom_name}
              aside={<span className="text-xs text-slate-500">{a.student_count} siswa</span>}
            />
          ))}
        </Panel>
      </div>
    </>
  )
}
