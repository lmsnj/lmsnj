import { ArrowRight, Layers, Plus, TriangleAlert } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { schoolsApi } from '../../api/schools'
import Badge from '../../components/Badge'
import { SchoolLogoBox } from '../../components/brand/SchoolLogo'
import Button from '../../components/Button'
import { DashboardState, Panel, PanelItem } from '../../components/Dashboard'
import useAuth from '../../hooks/useAuth'
import useBranding from '../../hooks/useBranding'
import useFetch from '../../hooks/useFetch'
import { attentionItems, byLevelGroup, totals } from '../../utils/foundation'
import { firstName, longDate, timeGreeting } from '../../utils/greeting'

/**
 * Beranda admin yayasan (gaya panel admin): judul "Dashboard", kartu angka putih, lalu daftar
 * sekolah. Ini gambaran seluruh sekolah, bukan fitur satu sekolah — fitur admin satu sekolah
 * ada di menu setelah sekolah dibuka lewat "Ganti Sekolah".
 */
export default function FoundationDashboard() {
  const { user } = useAuth()
  const { app } = useBranding()
  const { data, error } = useFetch(schoolsApi.summary)

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            {timeGreeting()}, {firstName(user.full_name)} · {longDate()} · {app.school_name}
          </p>
        </div>
        <Link
          to="/admin/sekolah?baru=1"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-900"
        >
          <Plus className="size-4" aria-hidden="true" />
          Tambah Sekolah
        </Link>
      </div>

      <DashboardState loading={!data} error={error}>
        {data && <FoundationContent schools={data} />}
      </DashboardState>
    </>
  )
}

// Kartu angka polos: label abu-abu di atas, angka besar di bawah.
function NumberCard({ label, value, hint, to }) {
  const className = 'block rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition'
  const content = (
    <>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-extrabold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </>
  )
  if (!to) return <div className={className}>{content}</div>
  return (
    <Link to={to} className={`${className} hover:shadow-md hover:ring-brand-300`}>
      {content}
    </Link>
  )
}

function FoundationContent({ schools }) {
  const sum = totals(schools)
  const issues = attentionItems(schools)

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <NumberCard
          label="Sekolah aktif"
          value={sum.schools}
          hint={sum.inactive ? `${sum.inactive} nonaktif` : undefined}
          to="/admin/sekolah"
        />
        <NumberCard label="Total siswa" value={sum.students} />
        <NumberCard label="Total guru" value={sum.teachers} />
        <NumberCard label="Total kelas" value={sum.classrooms} hint="Tahun ajaran terbaru" />
        <NumberCard label="Mata pelajaran" value={sum.subjects} />
        <NumberCard label="Materi" value={sum.materials} />
        <NumberCard
          label="Tugas & asesmen"
          value={sum.tasks + sum.assessments}
          hint={`${sum.tasks} tugas · ${sum.assessments} asesmen`}
        />
        <NumberCard label="Pengumpulan 7 hari terakhir" value={sum.submissions_this_week} />
      </div>

      <SchoolList schools={schools} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
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
    </>
  )
}

// Daftar semua sekolah. "Buka" = membuka sekolah itu (menu berganti ke menu admin sekolah tsb.).
function SchoolList({ schools }) {
  const { school: current, schools: openable, selectSchool } = useAuth()
  const navigate = useNavigate()
  const open = (row) => {
    const target = openable.find((item) => item.id === row.id)
    if (!target) return
    if (target.id !== current?.id) selectSchool(target)
    navigate('/admin')
  }

  return (
    <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Data sekolah</h2>
        <Link to="/admin/sekolah" className="text-sm font-medium text-brand-700 hover:underline">
          Kelola daftar sekolah →
        </Link>
      </div>
      {schools.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Belum ada sekolah. Tambahkan lewat tombol Tambah Sekolah.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {schools.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 py-4">
              <SchoolLogoBox school={row} className="size-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{row.name}</p>
                <p className="text-sm text-slate-500">
                  {row.level_display} · {row.academic_year ?? 'belum ada kelas'} · {row.students}{' '}
                  siswa · {row.teachers} guru · {row.classrooms} kelas
                </p>
              </div>
              <Badge color={row.is_active ? 'green' : 'red'}>
                {row.is_active ? 'Aktif' : 'Nonaktif'}
              </Badge>
              {row.is_active && (
                <Button variant="ghost" size="sm" onClick={() => open(row)}>
                  Buka <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
