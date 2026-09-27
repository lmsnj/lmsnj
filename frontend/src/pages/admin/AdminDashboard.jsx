import {
  Activity,
  BookOpen,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  Library,
  School,
  Send,
  TriangleAlert,
  UserCog,
} from 'lucide-react'
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
import useFetch from '../../hooks/useFetch'
import { ROLES } from '../../utils/constants'
import { formatDate } from '../../utils/media'

// Hal yang perlu ditindaklanjuti admin; hanya yang jumlahnya > 0 yang ditampilkan.
const ATTENTION = [
  {
    key: 'students_without_classroom',
    label: 'siswa belum dimasukkan ke kelas',
    to: '/admin/pengguna',
  },
  {
    key: 'teachers_without_assignment',
    label: 'guru belum mengampu mapel di tahun ajaran ini',
    to: '/admin/pengampu',
  },
  { key: 'classrooms_without_homeroom', label: 'kelas belum punya wali kelas', to: '/admin/kelas' },
  { key: 'classrooms_without_students', label: 'kelas belum punya siswa', to: '/admin/kelas' },
]

export default function AdminDashboard() {
  const { data, error } = useFetch(dashboardApi.get)
  useScrollToHash(Boolean(data))

  return (
    <>
      <HomeTop
        cards={HOME_CARDS[ROLES.ADMIN]}
        stats={
          data?.academic_year
            ? [{ icon: CalendarDays, content: `Tahun ajaran ${data.academic_year}` }]
            : []
        }
      />
      <SummaryHeading subtitle={data?.academic_year && `Tahun ajaran ${data.academic_year}`} />
      <DashboardState loading={!data} error={error}>
        {data && <AdminContent data={data} />}
      </DashboardState>
    </>
  )
}

function AdminContent({ data }) {
  const { stats, attention } = data
  const issues = ATTENTION.filter((item) => attention[item.key] > 0)

  return (
    <>
      <StatGrid>
        <StatCard
          label="Siswa aktif"
          icon={GraduationCap}
          tone="brand"
          value={stats.students}
          to="/admin/pengguna"
        />
        <StatCard
          label="Guru aktif"
          icon={UserCog}
          tone="blue"
          value={stats.teachers}
          to="/admin/pengguna"
        />
        <StatCard
          label="Kelas"
          icon={School}
          tone="amber"
          value={stats.classrooms}
          hint="tahun ajaran ini"
          to="/admin/kelas"
        />
        <StatCard
          label="Mata pelajaran"
          icon={Library}
          tone="violet"
          value={stats.subjects}
          to="/admin/mapel"
        />
        <StatCard
          label="Pengampu"
          icon={GraduationCap}
          value={stats.teaching_assignments}
          to="/admin/pengampu"
        />
        <StatCard label="Materi" icon={BookOpen} value={stats.materials} />
        <StatCard label="Tugas" icon={ClipboardList} value={stats.tasks} />
        <StatCard
          label="Pengumpulan"
          icon={Send}
          value={stats.submissions_this_week}
          hint="7 hari terakhir"
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Perlu ditindaklanjuti"
          icon={TriangleAlert}
          items={issues}
          empty="Semua data sudah lengkap. 👍"
        >
          {issues.map((item) => (
            <PanelItem
              key={item.key}
              to={item.to}
              title={
                <>
                  <span className="font-bold text-amber-700">{attention[item.key]}</span>{' '}
                  {item.label}
                </>
              }
              aside={<span className="text-brand-700">Atur →</span>}
            />
          ))}
        </Panel>

        <Panel
          title="Aktivitas terbaru"
          icon={Activity}
          items={data.recent_activity}
          empty="Belum ada materi atau tugas yang dibuat guru."
        >
          {data.recent_activity.map((item) => (
            <PanelItem
              key={`${item.type}-${item.id}`}
              title={item.title}
              meta={`${item.created_by ?? 'Guru'} · ${item.subject_name} · ${item.classroom_name}`}
              aside={
                <>
                  <span className="flex justify-end gap-1">
                    {!item.is_published && <Badge color="amber">Draf</Badge>}
                    <Badge color={item.type === 'task' ? 'blue' : 'gray'}>
                      {item.type === 'task' ? 'Tugas' : 'Materi'}
                    </Badge>
                  </span>
                  <p className="mt-1 text-xs text-slate-500">{formatDate(item.created_at)}</p>
                </>
              }
            />
          ))}
        </Panel>
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Kelola data melalui menu{' '}
        <Link to="/admin/pengguna" className="underline">
          Pengguna
        </Link>
        ,{' '}
        <Link to="/admin/kelas" className="underline">
          Kelas
        </Link>
        ,{' '}
        <Link to="/admin/mapel" className="underline">
          Mata Pelajaran
        </Link>
        , dan{' '}
        <Link to="/admin/pengampu" className="underline">
          Pengampu
        </Link>
        .
      </p>
    </>
  )
}
