import { BookOpen, CalendarX, ClipboardList, School, Send, Star, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { dashboardApi } from '../../api/dashboard'
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
import EmptyState from '../../components/EmptyState'
import useFetch from '../../hooks/useFetch'
import { MATERIAL_TYPES } from '../../utils/constants'
import { ROLES } from '../../utils/constants'
import { formatDate } from '../../utils/media'
import { dueLabel, formatScore } from '../../utils/tasks'

export default function StudentDashboard() {
  const { data, error } = useFetch(dashboardApi.get)
  useScrollToHash(Boolean(data))
  return (
    <>
      <HomeTop
        cards={HOME_CARDS[ROLES.STUDENT]}
        stats={
          data?.classroom_name ? [{ icon: School, content: `Kelas ${data.classroom_name}` }] : []
        }
      />
      <SummaryHeading subtitle={data?.classroom_name && `Kelas ${data.classroom_name}`} />
      <DashboardState loading={!data} error={error}>
        {data && <StudentContent data={data} />}
      </DashboardState>
    </>
  )
}

function StudentContent({ data }) {
  if (!data.classroom_name) {
    return (
      <EmptyState title="Anda belum terdaftar di kelas mana pun">
        Hubungi admin sekolah agar dimasukkan ke kelas Anda.
      </EmptyState>
    )
  }

  const { stats } = data
  return (
    <>
      <StatGrid>
        <StatCard
          label="Tugas belum dikumpulkan"
          icon={ClipboardList}
          to="/siswa/tugas?status=belum"
          value={stats.pending}
          tone={stats.pending ? 'brand' : 'default'}
        />
        <StatCard
          label="Terlambat"
          icon={CalendarX}
          value={stats.overdue}
          tone={stats.overdue ? 'red' : 'default'}
          hint="lewat tenggat, masih bisa dikumpulkan"
        />
        <StatCard
          label="Sudah dikumpulkan"
          icon={Send}
          tone="blue"
          value={stats.submitted}
          to="/siswa/tugas?status=sudah"
        />
        <StatCard
          label="Rata-rata nilai"
          icon={TrendingUp}
          tone="violet"
          to="/siswa/nilai"
          value={formatScore(stats.average)}
          hint={stats.graded ? `dari ${stats.graded} tugas dinilai (skala 100)` : 'belum ada nilai'}
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Tugas yang harus dikerjakan"
          icon={ClipboardList}
          items={data.pending_tasks}
          empty="Semua tugas sudah dikumpulkan. Hebat! 🎉"
        >
          {data.pending_tasks.map((task) => (
            <PanelItem
              key={task.id}
              to={`/siswa/tugas/${task.id}`}
              title={task.title}
              meta={`${task.subject_name} · tenggat ${formatDate(task.due_at)}`}
              aside={
                <Badge color={task.is_past_due ? 'red' : 'blue'}>
                  {task.is_past_due ? 'Terlambat' : dueLabel(task.due_at)}
                </Badge>
              }
            />
          ))}
        </Panel>

        <Panel
          title="Nilai terbaru"
          icon={Star}
          items={data.recent_grades}
          empty="Belum ada tugas yang dinilai."
        >
          {data.recent_grades.map((grade) => (
            <PanelItem
              key={grade.task_id}
              to={`/siswa/tugas/${grade.task_id}`}
              title={grade.task_title}
              meta={`${grade.subject_name}${grade.has_feedback ? ' · ada umpan balik' : ''}`}
              aside={
                <span className="font-bold text-brand-700">
                  {formatScore(grade.score)}
                  <span className="font-normal text-slate-500">/{grade.max_score}</span>
                </span>
              }
            />
          ))}
        </Panel>

        <Panel
          title="Materi terbaru"
          icon={BookOpen}
          items={data.recent_materials}
          empty="Belum ada materi dari guru."
          action={
            <Link to="/siswa/mapel" className="text-sm text-brand-700 hover:underline">
              Semua mapel →
            </Link>
          }
        >
          {data.recent_materials.map((material) => (
            <PanelItem
              key={material.id}
              to={`/siswa/mapel/${material.teaching_assignment}?tab=materi`}
              title={material.title}
              meta={`${material.subject_name} · ${formatDate(material.created_at)}`}
              aside={
                <Badge color={MATERIAL_TYPES[material.material_type].color}>
                  {MATERIAL_TYPES[material.material_type].label}
                </Badge>
              }
            />
          ))}
        </Panel>
      </div>
    </>
  )
}
