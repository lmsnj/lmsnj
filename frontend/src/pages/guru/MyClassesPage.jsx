import { assignmentsApi, classroomsApi } from '../../api/academics'
import Alert from '../../components/Alert'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import SubjectCard from '../../components/SubjectCard'
import useAuth from '../../hooks/useAuth'
import useFetch from '../../hooks/useFetch'
import { ALL } from '../../utils/academic'

export default function MyClassesPage() {
  const { user } = useAuth()
  // Backend otomatis hanya mengirim pengampu milik guru yang login.
  const assignments = useFetch(assignmentsApi.list, ALL)
  const homerooms = useFetch(classroomsApi.list, { ...ALL, homeroom_teacher: user.id })

  const items = assignments.data?.results ?? []

  return (
    <>
      <PageHeader title="Kelas Saya" description="Mapel dan kelas yang Anda ampu." />

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
      ) : items.length === 0 ? (
        <EmptyState title="Belum ada kelas yang Anda ampu">
          Hubungi admin untuk didaftarkan sebagai pengampu mapel.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <SubjectCard
              key={a.id}
              to={`/guru/kelas/${a.id}`}
              title={a.subject_name}
              subtitle={a.classroom_name}
              meta={`${a.student_count} siswa · ${a.academic_year}`}
            />
          ))}
        </div>
      )}
    </>
  )
}
