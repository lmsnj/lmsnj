import { Link, useParams } from 'react-router-dom'
import { assignmentsApi } from '../../api/academics'
import { chaptersApi, materialsApi } from '../../api/materials'
import { tasksApi } from '../../api/tasks'
import Alert from '../../components/Alert'
import ClassHero, { Avatar } from '../../components/ClassHero'
import ChapterModule from '../../components/ChapterModule'
import ClassOverview from '../../components/ClassOverview'
import EmptyState from '../../components/EmptyState'
import MaterialModule from '../../components/MaterialModule'
import ProgressBar from '../../components/ProgressBar'
import Spinner from '../../components/Spinner'
import TaskList from '../../components/TaskList'
import useFetch from '../../hooks/useFetch'
import { useTabs } from '../../hooks/useTabs'
import { ALL } from '../../utils/academic'
import { groupByChapter, pathSummary } from '../../utils/learningPath'
import { teamTeachers } from '../../utils/teams'

const TABS = [
  { id: 'ringkasan', label: 'Ringkasan' },
  { id: 'materi', label: 'Materi' },
  { id: 'tugas', label: 'Tugas' },
]

// Backend hanya mengirim materi & tugas yang sudah terbit untuk siswa.
function MaterialsTab({ assignmentId }) {
  const params = { ...ALL, teaching_assignment: assignmentId }
  const materials = useFetch(materialsApi.list, params)
  const chapters = useFetch(chaptersApi.list, params)
  const summary = pathSummary(materials.data?.results)
  // Guru membuat Bab -> tampilan bab (+ Post Test); tanpa bab -> tampilan modul per materi.
  const groups = chapters.data?.results.length
    ? groupByChapter(materials.data?.results, chapters.data.results, { skipEmpty: true })
    : null
  const reload = () => {
    materials.reload()
    chapters.reload()
  }
  return (
    <>
      <Alert type="error">{materials.error || chapters.error}</Alert>
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
      {(!materials.data && materials.loading) || (!chapters.data && chapters.loading) ? (
        <div className="py-10 text-center text-brand-600">
          <Spinner />
        </div>
      ) : groups?.length ? (
        <ChapterModule groups={groups} onChange={reload} />
      ) : materials.data?.results.length ? (
        <MaterialModule materials={materials.data.results} onChange={reload} />
      ) : (
        !materials.error && <EmptyState title="Guru belum membagikan materi untuk mapel ini." />
      )}
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
      people={teamTeachers(assignment).map((name) => ({
        name,
        role: `Guru ${assignment.subject_name}`,
      }))}
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
          ...teamTeachers(a).map((name) => (
            <>
              Guru <Avatar name={name} />
              <strong className="text-slate-800">{name}</strong>
            </>
          )),
        ]}
      />
      {tabsBar}
      {tab === 'ringkasan' && <Overview assignment={a} onSelectTab={selectTab} />}
      {tab === 'materi' && <MaterialsTab assignmentId={a.id} />}
      {tab === 'tugas' && <TasksTab assignmentId={a.id} />}
    </>
  )
}
