import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  Layers,
  Library,
  School,
  Send,
  TriangleAlert,
  UserCog,
  Users,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { schoolsApi } from '../../api/schools'
import Badge from '../../components/Badge'
import { SchoolLogoBox } from '../../components/brand/SchoolLogo'
import Button from '../../components/Button'
import {
  DashboardState,
  Panel,
  PanelItem,
  StatCard,
  StatGrid,
  SummaryHeading,
} from '../../components/Dashboard'
import DataTable from '../../components/DataTable'
import PageHero from '../../components/PageHero'
import useAuth from '../../hooks/useAuth'
import useBranding from '../../hooks/useBranding'
import useFetch from '../../hooks/useFetch'
import { attentionItems, byLevelGroup, totals } from '../../utils/foundation'
import { firstName, longDate, timeGreeting } from '../../utils/greeting'

const HERO_ICONS = [Building2, School, GraduationCap, Users, BookOpen, Layers, ClipboardList]

/**
 * Beranda admin yayasan: gambaran seluruh sekolah yang terdaftar (bukan fitur satu sekolah).
 * Fitur admin satu sekolah tetap ada di menu, untuk sekolah yang dibuka lewat "Ganti Sekolah".
 */
export default function FoundationDashboard() {
  const { user } = useAuth()
  const { app } = useBranding()
  const { data, error } = useFetch(schoolsApi.summary)
  const sum = data ? totals(data) : null

  return (
    <>
      <PageHero
        title={`Halo, ${firstName(user.full_name)}! 👋`}
        description={`${timeGreeting()}, ${user.full_name}. Berikut gambaran seluruh sekolah di bawah ${app.school_name}.`}
        icons={HERO_ICONS}
        centerIcon={Building2}
        stats={[
          { icon: CalendarDays, content: longDate() },
          { icon: Building2, content: <strong className="text-white">{app.school_name}</strong> },
          sum && {
            icon: School,
            content: (
              <>
                <strong className="text-white">{sum.schools}</strong> sekolah aktif
              </>
            ),
          },
        ].filter(Boolean)}
      />

      <SummaryHeading subtitle="Gabungan semua sekolah aktif (kelas: tahun ajaran terbaru tiap sekolah)" />
      <DashboardState loading={!data} error={error}>
        {data && <FoundationContent schools={data} sum={sum} />}
      </DashboardState>
    </>
  )
}

function FoundationContent({ schools, sum }) {
  const issues = attentionItems(schools)

  return (
    <>
      <StatGrid>
        <StatCard
          label="Sekolah aktif"
          icon={Building2}
          tone="brand"
          value={sum.schools}
          hint={sum.inactive ? `${sum.inactive} nonaktif` : undefined}
          to="/admin/sekolah"
        />
        <StatCard label="Total siswa" icon={GraduationCap} tone="blue" value={sum.students} />
        <StatCard label="Total guru" icon={UserCog} tone="violet" value={sum.teachers} />
        <StatCard label="Total kelas" icon={School} tone="amber" value={sum.classrooms} />
        <StatCard label="Mata pelajaran" icon={Library} value={sum.subjects} />
        <StatCard label="Materi" icon={BookOpen} value={sum.materials} />
        <StatCard
          label="Tugas & asesmen"
          icon={ClipboardList}
          value={sum.tasks + sum.assessments}
          hint={`${sum.tasks} tugas · ${sum.assessments} asesmen`}
        />
        <StatCard
          label="Pengumpulan"
          icon={Send}
          value={sum.submissions_this_week}
          hint="7 hari terakhir"
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Sebaran per jenjang" icon={Layers}>
          {byLevelGroup(schools).map((group) => (
            <PanelItem
              key={group.id}
              title={group.label}
              meta={`${group.schools} sekolah`}
              aside={
                <span className="text-slate-600">
                  <strong className="text-slate-900">{group.students}</strong> siswa ·{' '}
                  <strong className="text-slate-900">{group.teachers}</strong> guru
                </span>
              }
            />
          ))}
        </Panel>
        <Panel
          title="Perlu perhatian"
          icon={TriangleAlert}
          items={issues}
          empty="Data semua sekolah sudah lengkap. 👍"
        >
          {issues.map((item) => (
            <PanelItem
              key={item.key}
              title={
                <>
                  <span className="font-semibold">{item.school.name}</span>{' '}
                  <span className="text-amber-700">{item.text}</span>
                </>
              }
            />
          ))}
        </Panel>
      </div>

      <SchoolTable schools={schools} />
    </>
  )
}

// Tabel data semua sekolah. "Buka" = pindah ke sekolah itu untuk mengelola datanya.
function SchoolTable({ schools }) {
  const { school: current, schools: openable, selectSchool } = useAuth()
  const navigate = useNavigate()
  const open = (row) => {
    const target = openable.find((item) => item.id === row.id)
    if (!target) return
    if (target.id !== current?.id) selectSchool(target)
    navigate('/admin/pengguna')
  }

  const columns = [
    {
      header: 'Sekolah',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <SchoolLogoBox school={row} className="size-10" />
          <div className="min-w-0">
            <p className="font-semibold whitespace-nowrap text-slate-900">{row.name}</p>
            <div className="mt-0.5 flex gap-1">
              <Badge color="green">{row.level_display}</Badge>
              {!row.is_active && <Badge color="red">Nonaktif</Badge>}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Tahun ajaran',
      cell: (row) => row.academic_year ?? <span className="text-slate-400">-</span>,
      className: 'whitespace-nowrap',
    },
    { header: 'Siswa', cell: (row) => row.students, className: 'text-right' },
    { header: 'Guru', cell: (row) => row.teachers, className: 'text-right' },
    { header: 'Kelas', cell: (row) => row.classrooms, className: 'text-right' },
    { header: 'Mapel', cell: (row) => row.subjects, className: 'text-right' },
    { header: 'Materi', cell: (row) => row.materials, className: 'text-right' },
    { header: 'Tugas', cell: (row) => row.tasks, className: 'text-right' },
    {
      header: 'Aksi',
      className: 'text-right',
      cell: (row) =>
        row.is_active ? (
          <Button variant="ghost" size="sm" onClick={() => open(row)}>
            Buka <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        ) : null,
    },
  ]

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <Building2 className="size-5 text-brand-600" aria-hidden="true" />
          Data Sekolah Terdaftar
        </h2>
        <Link to="/admin/sekolah" className="text-sm font-medium text-brand-700 hover:underline">
          Kelola daftar sekolah →
        </Link>
      </div>
      <DataTable
        columns={columns}
        rows={schools}
        emptyMessage="Belum ada sekolah. Tambahkan di menu Daftar Sekolah."
      />
    </section>
  )
}
