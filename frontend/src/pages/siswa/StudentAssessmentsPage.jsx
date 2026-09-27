import { useState } from 'react'
import { Link } from 'react-router-dom'
import { assessmentsApi } from '../../api/assessments'
import Alert from '../../components/Alert'
import AssignmentSelect from '../../components/AssignmentSelect'
import Badge from '../../components/Badge'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import useFetch from '../../hooks/useFetch'
import { ALL } from '../../utils/academic'
import { studentAssessmentStatus } from '../../utils/assessments'
import { formatDate } from '../../utils/media'
import { dueLabel } from '../../utils/tasks'

// "Lembar Asesmen" siswa: semua kuis yang sudah diterbitkan guru untuk kelasnya.
export default function StudentAssessmentsPage() {
  const [assignment, setAssignment] = useState('')
  const assessments = useFetch(assessmentsApi.list, {
    ...ALL,
    teaching_assignment: assignment || undefined,
    ordering: 'due_at',
  })
  const items = assessments.data?.results

  return (
    <>
      <PageHeader
        title="Lembar Asesmen"
        description="Kuis online dari guru. Setiap asesmen hanya bisa dikerjakan satu kali."
      />
      <AssignmentSelect
        value={assignment}
        onChange={setAssignment}
        placeholder="Semua mata pelajaran"
        optionLabel={(a) => a.subject_name}
        className="mb-4 sm:max-w-sm"
        aria-label="Filter mata pelajaran"
      />
      <Alert type="error">{assessments.error}</Alert>
      {assessments.loading && !items ? (
        <div className="py-10 text-center text-brand-600">
          <Spinner />
        </div>
      ) : !items?.length ? (
        <EmptyState title="Belum ada lembar asesmen" />
      ) : (
        <ul className="space-y-3">
          {items.map((a) => {
            const status = studentAssessmentStatus(a)
            return (
              <li key={a.id}>
                <Link
                  to={`/siswa/asesmen/${a.id}`}
                  className="block rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md hover:ring-brand-600"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold text-slate-900">{a.title}</p>
                    <Badge color={status.color}>{status.label}</Badge>
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-500">{a.subject_name}</p>
                  <p className="mt-1 text-sm text-slate-700">
                    Tenggat {formatDate(a.due_at)}{' '}
                    <span className="text-slate-500">({dueLabel(a.due_at)})</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {a.question_count} soal · {a.max_score} poin
                    {a.duration_minutes ? ` · waktu ${a.duration_minutes} menit` : ''}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
