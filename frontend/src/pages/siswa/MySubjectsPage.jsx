import { assignmentsApi } from '../../api/academics'
import { authApi } from '../../api/auth'
import Alert from '../../components/Alert'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import SubjectCard from '../../components/SubjectCard'
import useFetch from '../../hooks/useFetch'
import { ALL } from '../../utils/academic'

export default function MySubjectsPage() {
  // Data diri diambil ulang agar perubahan kelas oleh admin langsung terlihat tanpa login ulang.
  const me = useFetch(authApi.me)
  // Backend otomatis hanya mengirim mapel di kelas siswa yang login.
  const assignments = useFetch(assignmentsApi.list, ALL)
  const items = assignments.data?.results ?? []

  if (me.data && !me.data.classroom) {
    return (
      <>
        <PageHeader title="Mapel Saya" />
        <EmptyState title="Anda belum terdaftar di kelas mana pun">
          Hubungi admin sekolah agar dimasukkan ke kelas Anda.
        </EmptyState>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Mapel Saya" description={me.data && `Kelas ${me.data.classroom_name}`} />
      <Alert type="error">{assignments.error}</Alert>

      {assignments.loading && !items.length ? (
        <div className="py-10 text-center text-brand-600">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="Belum ada mapel di kelas Anda" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <SubjectCard
              key={a.id}
              to={`/siswa/mapel/${a.id}`}
              title={a.subject_name}
              subtitle={`Guru: ${a.teacher_name}`}
              meta={a.subject_code}
            />
          ))}
        </div>
      )}
    </>
  )
}
