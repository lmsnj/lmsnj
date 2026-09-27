import {
  BookOpenCheck,
  CalendarX,
  ClipboardCheck,
  ClipboardList,
  Medal,
  Send,
  Star,
  Target,
  Trophy,
} from 'lucide-react'
import { useState } from 'react'
import { assignmentsApi } from '../../api/academics'
import { tasksApi } from '../../api/tasks'
import Alert from '../../components/Alert'
import ListExplorer from '../../components/ListExplorer'
import TaskList from '../../components/TaskList'
import useFetch from '../../hooks/useFetch'
import useQueryFlag from '../../hooks/useQueryFlag'
import { ALL } from '../../utils/academic'
import { EMPTY_FILTERS } from '../../utils/listFilters'
import { canSubmit } from '../../utils/tasks'

// Id status sama dengan penanda dari Beranda (?status=belum / ?status=sudah).
const STATUSES = [
  {
    id: 'belum',
    title: 'Belum Dikumpulkan',
    description: 'Masih bisa dikerjakan dan dikumpulkan',
    icon: ClipboardList,
    tile: 'bg-blue-100 text-blue-600',
    // Aturan sama dengan backend.
    match: (t) => !t.my_submission && canSubmit(t),
  },
  {
    id: 'sudah',
    title: 'Sudah Dikumpulkan',
    description: 'Jawaban sudah terkirim ke guru',
    icon: Send,
    tile: 'bg-brand-100 text-brand-700',
    match: (t) => Boolean(t.my_submission),
  },
  {
    id: 'dinilai',
    title: 'Sudah Dinilai',
    description: 'Lihat nilai dan umpan balik guru',
    icon: Star,
    tile: 'bg-amber-100 text-amber-700',
    match: (t) => t.my_submission?.score != null,
  },
  {
    id: 'terlewat',
    title: 'Terlewat',
    description: 'Tenggat lewat dan tidak dikumpulkan',
    icon: CalendarX,
    tile: 'bg-red-100 text-red-600',
    match: (t) => !t.my_submission && !canSubmit(t),
  },
]

const HERO_ICONS = [ClipboardList, Star, Send, Target, BookOpenCheck, Medal, Trophy]

// "Tugas" siswa: semua tugas dari semua mapel, disaring di browser.
export default function StudentTasksPage() {
  const initialStatus = useQueryFlag('status')
  const [filters, setFilters] = useState({
    ...EMPTY_FILTERS,
    status: STATUSES.some((s) => s.id === initialStatus) ? initialStatus : '',
  })
  const tasks = useFetch(tasksApi.list, { ...ALL, ordering: 'due_at' })
  const assignments = useFetch(assignmentsApi.list, ALL)
  const all = tasks.data?.results ?? []
  const pending = all.filter(STATUSES[0].match).length
  const graded = all.filter(STATUSES[2].match).length

  return (
    <ListExplorer
      hero={{
        title: 'Tugas',
        description: 'Tugas dari semua mata pelajaran di kelas Anda. Kumpulkan sebelum tenggat!',
        icons: HERO_ICONS,
        centerIcon: ClipboardCheck,
        stats: [
          {
            icon: ClipboardList,
            content: (
              <>
                <strong className="text-white">{pending} tugas</strong> belum dikumpulkan
              </>
            ),
          },
          {
            icon: Star,
            content: (
              <>
                <strong className="text-white">{graded} tugas</strong> sudah dinilai
              </>
            ),
          },
        ],
      }}
      searchPlaceholder="Cari judul tugas..."
      items={all}
      textOf={(t) => `${t.title} ${t.subject_name}`}
      assignments={assignments.data?.results}
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
            showContext={!filters.assignment}
            linkTo={(task) => `/siswa/tugas/${task.id}`}
            emptyTitle={
              filters.status === 'belum'
                ? 'Semua tugas sudah dikumpulkan. 🎉'
                : all.length
                  ? 'Tidak ada tugas yang cocok.'
                  : 'Belum ada tugas.'
            }
          />
        </>
      )}
    </ListExplorer>
  )
}
