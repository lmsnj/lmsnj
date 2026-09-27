import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { assessmentsApi } from '../../api/assessments'
import Alert from '../../components/Alert'
import AssignmentSelect from '../../components/AssignmentSelect'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import useFetch from '../../hooks/useFetch'
import useQueryFlag from '../../hooks/useQueryFlag'
import { ALL } from '../../utils/academic'
import { formatDate } from '../../utils/media'
import { dueLabel } from '../../utils/tasks'
import AssessmentFormModal from './AssessmentFormModal'

// "Lembar Asesmen" guru: semua kuis di kelas yang ia ampu.
export default function TeacherAssessmentsPage() {
  const navigate = useNavigate()
  const openForm = useQueryFlag('baru') === '1'
  const [creating, setCreating] = useState(openForm)
  const [assignment, setAssignment] = useState('')
  const assessments = useFetch(assessmentsApi.list, {
    ...ALL,
    teaching_assignment: assignment || undefined,
  })
  const items = assessments.data?.results

  return (
    <>
      <PageHeader
        title="Lembar Asesmen"
        description="Kuis online: pilihan ganda dinilai otomatis, esai dinilai guru."
        actions={<Button onClick={() => setCreating(true)}>+ Buat Lembar Asesmen</Button>}
      />
      <AssignmentSelect
        value={assignment}
        onChange={setAssignment}
        className="mb-4 sm:max-w-sm"
        aria-label="Filter kelas & mapel"
      />
      <Alert type="error">{assessments.error}</Alert>

      {assessments.loading && !items ? (
        <div className="py-10 text-center text-brand-600">
          <Spinner />
        </div>
      ) : !items?.length ? (
        <EmptyState title="Belum ada lembar asesmen">
          Klik “Buat Lembar Asesmen” untuk membuat kuis pertama.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id}>
              <Link
                to={`/guru/asesmen/${a.id}`}
                className="block rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md hover:ring-brand-600"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{a.title}</p>
                  <div className="flex flex-wrap gap-1">
                    {a.needs_grading_count > 0 && (
                      <Badge color="amber">{a.needs_grading_count} perlu dinilai</Badge>
                    )}
                    <Badge color={a.is_published ? 'green' : 'amber'}>
                      {a.is_published ? 'Terbit' : 'Draf'}
                    </Badge>
                  </div>
                </div>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {a.subject_name} · {a.classroom_name}
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  Tenggat {formatDate(a.due_at)}{' '}
                  <span className="text-slate-500">({dueLabel(a.due_at)})</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {a.question_count} soal · {a.max_score} poin
                  {a.duration_minutes ? ` · ${a.duration_minutes} menit` : ''} · {a.submitted_count}{' '}
                  dari {a.student_count} siswa sudah mengumpulkan
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <AssessmentFormModal
          assignmentId={assignment || undefined}
          onClose={() => setCreating(false)}
          onSaved={(saved) => navigate(`/guru/asesmen/${saved.id}`)}
        />
      )}
    </>
  )
}
