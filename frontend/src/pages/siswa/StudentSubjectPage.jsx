import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { assignmentsApi } from '../../api/academics'
import { materialsApi } from '../../api/materials'
import { tasksApi } from '../../api/tasks'
import Alert from '../../components/Alert'
import ClassHero, { Avatar } from '../../components/ClassHero'
import ClassOverview from '../../components/ClassOverview'
import MaterialList from '../../components/MaterialList'
import MaterialViewer from '../../components/MaterialViewer'
import ProgressBar from '../../components/ProgressBar'
import Spinner from '../../components/Spinner'
import TaskList from '../../components/TaskList'
import useFetch from '../../hooks/useFetch'
import { useTabs } from '../../hooks/useTabs'
import { ALL } from '../../utils/academic'
import { pathSummary } from '../../utils/learningPath'

const TABS = [
  { id: 'ringkasan', label: 'Ringkasan' },
  { id: 'materi', label: 'Materi' },
  { id: 'tugas', label: 'Tugas' },
]

// Backend hanya mengirim materi & tugas yang sudah terbit untuk siswa.
function MaterialsTab({ assignmentId }) {
  const [viewing, setViewing] = useState(null)
  const materials = useFetch(materialsApi.list, { ...ALL, teaching_assignment: assignmentId })
  const summary = pathSummary(materials.data?.results)
  return (
    <>
      <Alert type="error">{materials.error}</Alert>
      {summary.total > 0 && (
        <section className="mb-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <ProgressBar
            value={summary.completed}
            max={summary.total}
            label={`${summary.completed} dari ${summary.total} materi tercapai`}
          />
          <p className="mt-2 text-sm text-slate-600">
            {summary.next
              ? `Lanjutkan: ${summary.next.title}. Materi berikutnya terbuka setelah capaiannya terpenuhi.`
              : summary.completed === summary.total
                ? 'Semua capaian materi mapel ini sudah terpenuhi. Hebat!'
                : 'Tunggu guru mengesahkan capaian Anda.'}
          </p>
        </section>
      )}
      <MaterialList
        materials={materials.data?.results}
        loading={materials.loading}
        emptyTitle="Guru belum membagikan materi untuk mapel ini."
        onOpen={setViewing}
      />
      <MaterialViewer
        material={viewing}
        onClose={() => setViewing(null)}
        onChange={(updated) => {
          setViewing(updated)
          materials.reload()
        }}
      />
    </>
  )
}

function TasksTab({ assignmentId }) {
  const tasks = useFetch(tasksApi.list, { ...ALL, teaching_assignment: assignmentId })
  return (
    <>
      <Alert type="error">{tasks.error}</Alert>
      <TaskList
        tasks={tasks.data?.results}
        loading={tasks.loading}
        linkTo={(task) => `/siswa/tugas/${task.id}`}
        emptyTitle="Belum ada tugas untuk mapel ini."
      />
    </>
  )
}

function Overview({ assignment, onSelectTab }) {
  const materials = useFetch(materialsApi.list, { ...ALL, teaching_assignment: assignment.id })
  const tasks = useFetch(tasksApi.list, { ...ALL, teaching_assignment: assignment.id })
  return (
    <ClassOverview
      materials={materials}
      tasks={tasks}
      people={[{ name: assignment.teacher_name, role: `Guru ${assignment.subject_name}` }]}
      onSelectTab={onSelectTab}
      taskLink={(task) => `/siswa/tugas/${task.id}`}
    />
  )
}

// Halaman satu mapel untuk siswa: ringkasan, materi, dan tugas.
export default function StudentSubjectPage() {
  const { id } = useParams()
  const assignment = useFetch(assignmentsApi.get, id)
  const [tab, tabsBar, selectTab] = useTabs(TABS)

  if (assignment.error) {
    return (
      <Alert type="error">
        {assignment.error}{' '}
        <Link to="/siswa/mapel" className="font-medium underline">
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
      <ClassHero
        back={{ to: '/siswa/mapel', label: 'Mapel Saya' }}
        title={a.subject_name}
        subject={a.subject_name}
        subjectLabel={a.classroom_name}
        info={[
          <>
            Tahun Ajaran <strong className="text-slate-800">{a.academic_year}</strong>
          </>,
          <>
            Guru <Avatar name={a.teacher_name} />
            <strong className="text-slate-800">{a.teacher_name}</strong>
          </>,
        ]}
      />
      {tabsBar}
      {tab === 'ringkasan' && <Overview assignment={a} onSelectTab={selectTab} />}
      {tab === 'materi' && <MaterialsTab assignmentId={a.id} />}
      {tab === 'tugas' && <TasksTab assignmentId={a.id} />}
    </>
  )
}
