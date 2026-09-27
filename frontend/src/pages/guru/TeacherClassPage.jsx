import { Link, useParams } from 'react-router-dom'
import { assignmentsApi, classroomsApi } from '../../api/academics'
import Alert from '../../components/Alert'
import DataTable from '../../components/DataTable'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import useFetch from '../../hooks/useFetch'
import { useTabs } from '../../hooks/useTabs'
import GradebookTab from './GradebookTab'
import MaterialsManager from './MaterialsManager'
import TasksTab from './TasksTab'

const TABS = [
  { id: 'materi', label: 'Materi' },
  { id: 'tugas', label: 'Tugas' },
  { id: 'nilai', label: 'Nilai' },
  { id: 'siswa', label: 'Siswa' },
]

function StudentsTab({ classroomId }) {
  const students = useFetch(classroomsApi.students, classroomId)
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

// Halaman satu kelas-mapel milik guru: materi, tugas, rekap nilai, dan daftar siswa.
export default function TeacherClassPage() {
  const { id } = useParams()
  const assignment = useFetch(assignmentsApi.get, id)
  const [tab, tabsBar] = useTabs(TABS)

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
  return (
    <>
      <Link to="/guru/kelas" className="mb-2 inline-block text-sm text-brand-700 hover:underline">
        ← Kelas saya
      </Link>
      <PageHeader
        title={`${a.subject_name} · ${a.classroom_name}`}
        description={`Tahun ajaran ${a.academic_year} · ${a.student_count} siswa`}
      />
      {tabsBar}
      {tab === 'materi' && <MaterialsManager assignmentId={a.id} />}
      {tab === 'tugas' && <TasksTab assignmentId={a.id} />}
      {tab === 'nilai' && <GradebookTab assignment={a} />}
      {tab === 'siswa' && <StudentsTab classroomId={a.classroom} />}
    </>
  )
}
