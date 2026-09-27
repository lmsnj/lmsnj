import {
  Brain,
  CalendarX,
  CircleCheckBig,
  ClipboardPen,
  Hourglass,
  Lightbulb,
  ListChecks,
  PlayCircle,
  Sigma,
  Star,
  Timer,
} from 'lucide-react'
import { useState } from 'react'
import { assignmentsApi } from '../../api/academics'
import { assessmentsApi } from '../../api/assessments'
import Alert from '../../components/Alert'
import AssessmentCard from '../../components/AssessmentCard'
import EmptyState from '../../components/EmptyState'
import ListExplorer from '../../components/ListExplorer'
import Spinner from '../../components/Spinner'
import useFetch from '../../hooks/useFetch'
import { ALL } from '../../utils/academic'
import { EMPTY_FILTERS } from '../../utils/listFilters'

const STATUSES = [
  {
    id: 'belum',
    title: 'Belum Dikerjakan',
    description: 'Kerjakan sebelum tenggat, hanya satu kali',
    icon: PlayCircle,
    tile: 'bg-blue-100 text-blue-600',
    match: (a) => !a.my_attempt && !a.is_past_due,
  },
  {
    id: 'dikerjakan',
    title: 'Sedang Dikerjakan',
    description: 'Lanjutkan sebelum waktu habis',
    icon: Hourglass,
    tile: 'bg-amber-100 text-amber-700',
    match: (a) => a.my_attempt?.status === 'in_progress',
  },
  {
    id: 'selesai',
    title: 'Sudah Dikumpulkan',
    description: 'Lihat nilai dan pembahasan',
    icon: CircleCheckBig,
    tile: 'bg-brand-100 text-brand-700',
    match: (a) => Boolean(a.my_attempt) && a.my_attempt.status !== 'in_progress',
  },
  {
    id: 'terlewat',
    title: 'Terlewat',
    description: 'Tenggat lewat dan tidak dikerjakan',
    icon: CalendarX,
    tile: 'bg-red-100 text-red-600',
    match: (a) => !a.my_attempt && a.is_past_due,
  },
]

const HERO_ICONS = [ListChecks, Sigma, ClipboardPen, Timer, Brain, Star, Lightbulb]

// "Lembar Asesmen" siswa: semua kuis yang sudah diterbitkan guru untuk kelasnya.
export default function StudentAssessmentsPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const assessments = useFetch(assessmentsApi.list, { ...ALL, ordering: 'due_at' })
  const assignments = useFetch(assignmentsApi.list, ALL)
  const all = assessments.data?.results ?? []
  const waiting = all.filter(STATUSES[0].match).length + all.filter(STATUSES[1].match).length

  return (
    <ListExplorer
      hero={{
        title: 'Lembar Asesmen',
        description: 'Kuis online dari guru. Setiap asesmen hanya bisa dikerjakan satu kali.',
        icons: HERO_ICONS,
        centerIcon: ClipboardPen,
        stats: [
          {
            icon: PlayCircle,
            content: (
              <>
                <strong className="text-white">{waiting} asesmen</strong> menunggu dikerjakan
              </>
            ),
          },
          {
            icon: CircleCheckBig,
            content: (
              <>
                <strong className="text-white">{all.filter(STATUSES[2].match).length}</strong> sudah
                dikumpulkan
              </>
            ),
          },
        ],
      }}
      searchPlaceholder="Cari judul asesmen..."
      items={all}
      textOf={(a) => `${a.title} ${a.subject_name}`}
      assignments={assignments.data?.results}
      unit="asesmen"
      statuses={STATUSES}
      statusTitle="Status Pengerjaan"
      filters={filters}
      onChange={setFilters}
    >
      {(shown) => (
        <>
          <Alert type="error" className="mb-3">
            {assessments.error || assignments.error}
          </Alert>
          {assessments.loading && !assessments.data ? (
            <div className="py-10 text-center text-brand-600">
              <Spinner />
            </div>
          ) : shown.length === 0 ? (
            <EmptyState
              title={all.length ? 'Tidak ada asesmen yang cocok.' : 'Belum ada lembar asesmen'}
            >
              {all.length
                ? 'Coba kata kunci lain atau hapus penyaring.'
                : 'Asesmen dari guru akan muncul di sini.'}
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {shown.map((a) => (
                <li key={a.id}>
                  <AssessmentCard
                    assessment={a}
                    to={`/siswa/asesmen/${a.id}`}
                    showContext={!filters.assignment}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </ListExplorer>
  )
}
