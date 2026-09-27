import { assignmentsApi } from '../../api/academics'
import { authApi } from '../../api/auth'
import Alert from '../../components/Alert'
import ClassCard from '../../components/ClassCard'
import EmptyState from '../../components/EmptyState'
import Spinner from '../../components/Spinner'
import useFetch from '../../hooks/useFetch'
import { ALL } from '../../utils/academic'

function Header({ description }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Mapel Saya</h1>
      {description && <p className="mt-1 text-slate-500 sm:text-lg">{description}</p>}
    </div>
  )
}

export default function MySubjectsPage() {
  // Data diri diambil ulang agar perubahan kelas oleh admin langsung terlihat tanpa login ulang.
  const me = useFetch(authApi.me)
  // Backend otomatis hanya mengirim mapel di kelas siswa yang login.
  const assignments = useFetch(assignmentsApi.list, ALL)
  const items = assignments.data?.results ?? []

  if (me.data && !me.data.classroom) {
    return (
      <>
        <Header />
        <EmptyState title="Anda belum terdaftar di kelas mana pun">
          Hubungi admin sekolah agar dimasukkan ke kelas Anda.
        </EmptyState>
      </>
    )
  }

  return (
    <>
      <Header
        description={
          me.data &&
          `Kelas ${me.data.classroom_name}${items.length ? ` · ${items.length} mata pelajaran` : ''}`
        }
      />
      <Alert type="error">{assignments.error}</Alert>

      {assignments.loading && !items.length ? (
        <div className="py-10 text-center text-brand-600">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="Belum ada mapel di kelas Anda" />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((a) => (
            <ClassCard
              key={a.id}
              to={`/siswa/mapel/${a.id}`}
              title={a.subject_name}
              subject={a.subject_name}
              subtitle={`Guru: ${a.teacher_name}`}
              info={[
                a.classroom_name,
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
