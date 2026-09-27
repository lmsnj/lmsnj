import { ClipboardPlus, FilePlus2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { assignmentsApi, classroomsApi } from '../../api/academics'
import { materialsApi } from '../../api/materials'
import { tasksApi } from '../../api/tasks'
import Alert from '../../components/Alert'
import ClassHero, { Avatar } from '../../components/ClassHero'
import ClassOverview, { QuickAction } from '../../components/ClassOverview'
import DataTable from '../../components/DataTable'
import Spinner from '../../components/Spinner'
import useFetch from '../../hooks/useFetch'
import { useTabs } from '../../hooks/useTabs'
import { ALL } from '../../utils/academic'
import GradebookTab from './GradebookTab'
import MaterialsManager from './MaterialsManager'
import TasksTab from './TasksTab'

const TABS = [
  { id: 'ringkasan', label: 'Ringkasan' },
  { id: 'materi', label: 'Materi' },
  { id: 'tugas', label: 'Tugas' },
  { id: 'nilai', label: 'Nilai' },
  { id: 'siswa', label: 'Anggota' },
]

function StudentsTab({ students }) {
  const columns = [
    { header: 'No', className: 'w-12', cell: (s) => students.data.indexOf(s) + 1 },
    {
      header: 'Nama',
      cell: (s) => (
        <span className="flex items-center gap-3 font-medium text-slate-900">
          <Avatar name={s.full_name} className="size-8 text-sm" />
          {s.full_name}
        </span>
      ),
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

function Overview({ assignment, students, onSelectTab, onCreate }) {
  const materials = useFetch(materialsApi.list, { ...ALL, teaching_assignment: assignment.id })
  const tasks = useFetch(tasksApi.list, { ...ALL, teaching_assignment: assignment.id })
  return (
    <ClassOverview
      forTeacher
      materials={materials}
      tasks={tasks}
      students={students}
      onSelectTab={onSelectTab}
      taskLink={(task) => `/guru/tugas/${task.id}`}
      actions={
        <>
          <QuickAction
            title="Tambah Materi"
            description="PDF, video, atau link"
            icon={FilePlus2}
            tile="bg-orange-500"
            onClick={() => onCreate('materi')}
          />
          <QuickAction
            title="Buat Tugas"
            description="Dengan tenggat & penilaian"
            icon={ClipboardPlus}
            tile="bg-blue-600"
            onClick={() => onCreate('tugas')}
          />
        </>
      }
    />
  )
}

function ClassContent({ assignment: a }) {
  const students = useFetch(classroomsApi.students, a.classroom)
  // Tab yang formnya langsung dibuka (dari kartu aksi cepat di Ringkasan). Dihapus saat pindah tab
  // agar form tidak terbuka lagi ketika kembali ke tab itu.
  const [creating, setCreating] = useState(null)
  const [tab, tabsBar, selectTab] = useTabs(TABS, () => setCreating(null))

  return (
    <>
      <ClassHero
        back={{ to: '/guru/kelas', label: 'Kelas Saya' }}
        title={a.classroom_name}
        subject={a.subject_name}
        info={[
          <>
            Tahun Ajaran <strong className="text-slate-800">{a.academic_year}</strong>
          </>,
          `${a.student_count} siswa`,
          <>
            Guru <Avatar name={a.teacher_name} />
            <strong className="text-slate-800">{a.teacher_name}</strong>
          </>,
        ]}
      />
      {tabsBar}
      {tab === 'ringkasan' && (
        <Overview
          assignment={a}
          students={students}
          onSelectTab={selectTab}
          onCreate={(target) => {
            selectTab(target) // memanggil setCreating(null) dulu...
            setCreating(target) // ...lalu ditimpa: form tab tujuan langsung terbuka
          }}
        />
      )}
      {tab === 'materi' && (
        <MaterialsManager assignmentId={a.id} openForm={creating === 'materi'} />
      )}
      {tab === 'tugas' && <TasksTab assignmentId={a.id} openForm={creating === 'tugas'} />}
      {tab === 'nilai' && <GradebookTab assignment={a} />}
      {tab === 'siswa' && <StudentsTab students={students} />}
    </>
  )
}

// Halaman satu kelas-mapel milik guru: ringkasan, materi, tugas, rekap nilai, dan anggota.
export default function TeacherClassPage() {
  const { id } = useParams()
  const assignment = useFetch(assignmentsApi.get, id)

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
  return <ClassContent assignment={assignment.data} />
}
