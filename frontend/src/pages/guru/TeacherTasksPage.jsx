import {
  BookOpenCheck,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  ClipboardPen,
  FilePenLine,
  Hourglass,
  Medal,
  Plus,
  Star,
  Target,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { assignmentsApi } from '../../api/academics'
import { tasksApi } from '../../api/tasks'
import Alert from '../../components/Alert'
import ListExplorer from '../../components/ListExplorer'
import { HeroButton } from '../../components/PageHero'
import TaskList from '../../components/TaskList'
import useFetch from '../../hooks/useFetch'
import useQueryFlag from '../../hooks/useQueryFlag'
import { ALL } from '../../utils/academic'
import { EMPTY_FILTERS } from '../../utils/listFilters'
import TaskFormModal from './TaskFormModal'

// Id status sama dengan penanda dari Beranda (?filter=perlu-dinilai).
const STATUSES = [
  {
    id: 'perlu-dinilai',
    title: 'Perlu Dinilai',
    description: 'Ada jawaban siswa yang belum diberi nilai',
    icon: Star,
    tile: 'bg-amber-100 text-amber-700',
    match: (t) => t.ungraded_count > 0,
  },
  {
    id: 'aktif',
    title: 'Masih Berjalan',
    description: 'Sudah terbit dan belum lewat tenggat',
    icon: Hourglass,
    tile: 'bg-blue-100 text-blue-600',
    match: (t) => t.is_published && !t.is_past_due,
  },
  {
    id: 'selesai',
    title: 'Lewat Tenggat',
    description: 'Waktu pengumpulan sudah berakhir',
    icon: CalendarCheck,
    tile: 'bg-brand-100 text-brand-700',
    match: (t) => t.is_published && t.is_past_due,
  },
  {
    id: 'draf',
    title: 'Draf',
    description: 'Belum terlihat oleh siswa',
    icon: FilePenLine,
    tile: 'bg-slate-100 text-slate-600',
    match: (t) => !t.is_published,
  },
]

const HERO_ICONS = [ClipboardList, Star, ClipboardPen, Target, BookOpenCheck, Medal, ClipboardCheck]

// "Tugas & Nilai": semua tugas guru dari semua kelas, disaring di browser.
export default function TeacherTasksPage() {
  const navigate = useNavigate()
  const initialFilter = useQueryFlag('filter')
  const openForm = useQueryFlag('baru') === '1'
  const [creating, setCreating] = useState(openForm)
  const [filters, setFilters] = useState({
    ...EMPTY_FILTERS,
    status: STATUSES.some((s) => s.id === initialFilter) ? initialFilter : '',
  })
  const tasks = useFetch(tasksApi.list, ALL)
  const assignments = useFetch(assignmentsApi.list, ALL)
  const all = tasks.data?.results ?? []
  const ungraded = all.reduce((sum, t) => sum + (t.ungraded_count ?? 0), 0)

  return (
    <>
      <ListExplorer
        hero={{
          title: 'Tugas & Nilai',
          description: 'Bagikan tugas, pantau pengumpulan, lalu beri nilai dan umpan balik.',
          icons: HERO_ICONS,
          centerIcon: ClipboardCheck,
          actions: (
            <HeroButton icon={Plus} onClick={() => setCreating(true)}>
              Bagikan Tugas
            </HeroButton>
          ),
          stats: [
            {
              icon: ClipboardList,
              content: (
                <>
                  <strong className="text-white">{all.length} tugas</strong> di semua kelas
                </>
              ),
            },
            {
              icon: Star,
              content: (
                <>
                  <strong className="text-white">{ungraded} jawaban</strong> menunggu dinilai
                </>
              ),
            },
          ],
        }}
        searchPlaceholder="Cari judul tugas..."
        items={all}
        textOf={(t) => `${t.title} ${t.subject_name} ${t.classroom_name}`}
        assignments={assignments.data?.results}
        assignmentSublabel={(a) => a.classroom_name}
        unit="tugas"
        statuses={STATUSES}
        statusTitle="Status Tugas"
        filters={filters}
        onChange={setFilters}
      >
        {(shown) => (
          <>
            <Alert type="error" className="mb-3">
              {tasks.error || assignments.error}
            </Alert>
            <TaskList
              tasks={shown}
              loading={tasks.loading}
              forTeacher
              showContext={!filters.assignment}
              linkTo={(task) => `/guru/tugas/${task.id}`}
              emptyTitle={
                filters.status === 'perlu-dinilai'
                  ? 'Semua jawaban sudah dinilai. 🎉'
                  : all.length
                    ? 'Tidak ada tugas yang cocok.'
                    : 'Belum ada tugas. Klik “Bagikan Tugas” untuk mulai.'
              }
            />
          </>
        )}
      </ListExplorer>

      {creating && (
        <TaskFormModal
          assignmentId={filters.assignment}
          onClose={() => setCreating(false)}
          onSaved={(saved) => navigate(`/guru/tugas/${saved.id}`)}
        />
      )}
    </>
  )
}
