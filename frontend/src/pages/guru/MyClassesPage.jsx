import { assignmentsApi, classroomsApi } from '../../api/academics'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import ClassCard from '../../components/ClassCard'
import EmptyState from '../../components/EmptyState'
import Spinner from '../../components/Spinner'
import useAuth from '../../hooks/useAuth'
import useFetch from '../../hooks/useFetch'
import { useTabs } from '../../hooks/useTabs'
import { ALL } from '../../utils/academic'

// Tab per tahun ajaran: tahun terbaru = "Kelas Aktif".
function yearTabs(items) {
  const years = [...new Set(items.map((a) => a.academic_year))].sort().reverse()
  if (!years.length) return [{ id: 'aktif', label: 'Kelas Aktif', year: null }]
  return years.map((year, index) =>
    index === 0
      ? { id: 'aktif', label: 'Kelas Aktif', year }
      : { id: year.replace('/', '-'), label: `Tahun Ajaran ${year}`, year },
  )
}

export default function MyClassesPage() {
  const { user } = useAuth()
  // Backend otomatis hanya mengirim pengampu milik guru yang login.
  const assignments = useFetch(assignmentsApi.list, ALL)
  const homerooms = useFetch(classroomsApi.list, { ...ALL, homeroom_teacher: user.id })

  const items = assignments.data?.results ?? []
  const tabs = yearTabs(items)
  const [tab, tabsBar] = useTabs(tabs)
  const year = tabs.find((t) => t.id === tab)?.year
  const shown = items.filter((a) => !year || a.academic_year === year)
  const homeroomIds = new Set((homerooms.data?.results ?? []).map((c) => c.id))

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Kelas Saya</h1>
        <p className="mt-1 text-slate-500 sm:text-lg">
          Kelola semua kelas yang Anda ampu dengan mudah.
        </p>
      </div>
      {tabsBar}

      {homerooms.data?.results.length > 0 && (
        <Alert type="info" className="mb-4">
          Anda adalah wali kelas:{' '}
          <strong>{homerooms.data.results.map((c) => c.name).join(', ')}</strong>
        </Alert>
      )}
      <Alert type="error">{assignments.error}</Alert>

      {assignments.loading && !items.length ? (
        <div className="py-10 text-center text-brand-600">
          <Spinner />
        </div>
      ) : shown.length === 0 ? (
        <EmptyState title="Belum ada kelas yang Anda ampu">
          Hubungi admin untuk didaftarkan sebagai pengampu mapel.
        </EmptyState>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((a) => (
            <ClassCard
              key={a.id}
              to={`/guru/kelas/${a.id}`}
              title={a.classroom_name}
              subject={a.subject_name}
              badge={homeroomIds.has(a.classroom) && <Badge color="green">Wali kelas</Badge>}
              info={[
                `${a.student_count} Siswa`,
                <>
                  Tahun Ajaran <strong className="text-slate-800">{a.academic_year}</strong>
                </>,
              ]}
            />
          ))}
        </div>
      )}
    </>
  )
}
