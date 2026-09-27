import {
  Brain,
  CalendarCheck,
  ClipboardPen,
  FilePenLine,
  Hourglass,
  Lightbulb,
  ListChecks,
  Plus,
  Sigma,
  Star,
  Timer,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { assignmentsApi } from '../../api/academics'
import { assessmentsApi } from '../../api/assessments'
import Alert from '../../components/Alert'
import AssessmentCard from '../../components/AssessmentCard'
import EmptyState from '../../components/EmptyState'
import ListExplorer from '../../components/ListExplorer'
import { HeroButton } from '../../components/PageHero'
import Spinner from '../../components/Spinner'
import useFetch from '../../hooks/useFetch'
import useQueryFlag from '../../hooks/useQueryFlag'
import { ALL } from '../../utils/academic'
import { EMPTY_FILTERS } from '../../utils/listFilters'
import AssessmentFormModal from './AssessmentFormModal'

const STATUSES = [
  {
    id: 'perlu-dinilai',
    title: 'Perlu Dinilai',
    description: 'Ada jawaban esai yang belum diberi nilai',
    icon: Star,
    tile: 'bg-amber-100 text-amber-700',
    match: (a) => a.needs_grading_count > 0,
  },
  {
    id: 'aktif',
    title: 'Sedang Berlangsung',
    description: 'Sudah terbit dan belum lewat tenggat',
    icon: Hourglass,
    tile: 'bg-blue-100 text-blue-600',
    match: (a) => a.is_published && !a.is_past_due,
  },
  {
    id: 'selesai',
    title: 'Lewat Tenggat',
    description: 'Waktu mengerjakan sudah berakhir',
    icon: CalendarCheck,
    tile: 'bg-brand-100 text-brand-700',
    match: (a) => a.is_published && a.is_past_due,
  },
  {
    id: 'draf',
    title: 'Draf',
    description: 'Belum terlihat oleh siswa',
    icon: FilePenLine,
    tile: 'bg-slate-100 text-slate-600',
    match: (a) => !a.is_published,
  },
]

const HERO_ICONS = [ListChecks, Sigma, ClipboardPen, Timer, Brain, Star, Lightbulb]

// "Lembar Asesmen" guru: semua kuis di kelas yang ia ampu, disaring di browser.
export default function TeacherAssessmentsPage() {
  const navigate = useNavigate()
  const openForm = useQueryFlag('baru') === '1'
  const [creating, setCreating] = useState(openForm)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const assessments = useFetch(assessmentsApi.list, ALL)
  const assignments = useFetch(assignmentsApi.list, ALL)
  const all = assessments.data?.results ?? []
  const ongoing = all.filter(STATUSES[1].match).length

  return (
    <>
      <ListExplorer
        hero={{
          title: 'Lembar Asesmen',
          description:
            'Kuis online bergaya ujian: pilihan ganda, PG kompleks, kategori, dan esai. Soal otomatis dinilai.',
          icons: HERO_ICONS,
          centerIcon: ClipboardPen,
          actions: (
            <HeroButton icon={Plus} onClick={() => setCreating(true)}>
              Buat Lembar Asesmen
            </HeroButton>
          ),
          stats: [
            {
              icon: ListChecks,
              content: (
                <>
                  <strong className="text-white">{all.length} lembar asesmen</strong> di semua kelas
                </>
              ),
            },
            {
              icon: Hourglass,
              content: (
                <>
                  <strong className="text-white">{ongoing}</strong> sedang berlangsung
                </>
              ),
            },
          ],
        }}
        searchPlaceholder="Cari judul asesmen..."
        items={all}
        textOf={(a) => `${a.title} ${a.subject_name} ${a.classroom_name}`}
        assignments={assignments.data?.results}
        assignmentSublabel={(a) => a.classroom_name}
        unit="asesmen"
        statuses={STATUSES}
        statusTitle="Status Asesmen"
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
                  : 'Klik “Buat Lembar Asesmen” untuk membuat kuis pertama.'}
              </EmptyState>
            ) : (
              <ul className="space-y-3">
                {shown.map((a) => (
                  <li key={a.id}>
                    <AssessmentCard assessment={a} to={`/guru/asesmen/${a.id}`} forTeacher />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </ListExplorer>

      {creating && (
        <AssessmentFormModal
          assignmentId={filters.assignment || undefined}
          onClose={() => setCreating(false)}
          onSaved={(saved) => navigate(`/guru/asesmen/${saved.id}`)}
        />
      )}
    </>
  )
}
