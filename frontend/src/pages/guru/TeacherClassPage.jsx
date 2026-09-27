import { Link, useParams } from 'react-router-dom'
import { assignmentsApi, classroomsApi } from '../../api/academics'
import Alert from '../../components/Alert'
import DataTable from '../../components/DataTable'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import useFetch from '../../hooks/useFetch'

// Halaman satu kelas-mapel milik guru. Materi dan tugas akan ditambahkan di sini (Fase 3–4).
export default function TeacherClassPage() {
  const { id } = useParams()
  const assignment = useFetch(assignmentsApi.get, id)
  const classroomId = assignment.data?.classroom
  // Daftar siswa baru dimuat setelah data pengampu (dan id kelasnya) diketahui.
  const students = useFetch(
    classroomId ? classroomsApi.students : () => Promise.resolve([]),
    classroomId ?? null,
  )

  if (assignment.error) {
    return (
      <Alert type="error">
        {assignment.error}{' '}
        <Link to="/guru/kelas" className="font-medium underline">
          Kembali
        </Link>
      </Alert>
    )
  }
  if (!assignment.data) {
    return (
      <div className="py-10 text-center text-brand-600">
        <Spinner />
      </div>
    )
  }

  const a = assignment.data
  const columns = [
    { header: 'No', className: 'w-12', cell: (s) => students.data.indexOf(s) + 1 },
    {
      header: 'Nama',
      cell: (s) => <span className="font-medium text-slate-900">{s.full_name}</span>,
    },
    { header: 'NIS', cell: (s) => s.nis || '-' },
  ]

  return (
    <>
      <Link to="/guru/kelas" className="mb-2 inline-block text-sm text-brand-700 hover:underline">
        ← Kelas saya
      </Link>
      <PageHeader
        title={`${a.subject_name} · ${a.classroom_name}`}
        description={`Tahun ajaran ${a.academic_year} · ${a.student_count} siswa`}
      />

      <Alert type="info" className="mb-6">
        Materi dan tugas untuk kelas ini akan tersedia di tahap berikutnya.
      </Alert>

      <h2 className="mb-3 font-semibold text-slate-900">Daftar Siswa</h2>
      <Alert type="error">{students.error}</Alert>
      <DataTable
        columns={columns}
        rows={students.data}
        loading={students.loading}
        emptyMessage="Belum ada siswa di kelas ini."
      />
    </>
  )
}
