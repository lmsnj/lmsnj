import { ArrowRight, Award, CalendarClock, ClipboardPen, ListChecks, Timer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { studentAssessmentStatus } from '../utils/assessments'
import { formatDate } from '../utils/media'
import { dueLabel } from '../utils/tasks'
import Badge from './Badge'
import ProgressBar from './ProgressBar'

// Teks tombol di kartu siswa sesuai keadaan pengerjaan.
function studentAction(assessment) {
  const attempt = assessment.my_attempt
  if (attempt?.status === 'in_progress') return 'Lanjutkan'
  if (attempt) return 'Lihat Hasil'
  return assessment.is_past_due ? 'Lihat Detail' : 'Kerjakan'
}

/**
 * Kartu satu lembar asesmen. `forTeacher`: status Draf/Terbit, perlu dinilai, dan kemajuan
 * pengumpulan; selain itu status & tombol untuk siswa.
 */
export default function AssessmentCard({ assessment: a, to, forTeacher, showContext = true }) {
  const status = forTeacher ? null : studentAssessmentStatus(a)
  const tile = forTeacher
    ? a.is_published
      ? 'bg-violet-100 text-violet-700'
      : 'bg-slate-100 text-slate-600'
    : ({
        green: 'bg-brand-100 text-brand-700',
        amber: 'bg-amber-100 text-amber-700',
        red: 'bg-red-100 text-red-600',
      }[status.color] ?? 'bg-violet-100 text-violet-700')
  return (
    <Link
      to={to}
      className="group flex items-start gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md hover:ring-brand-300"
    >
      <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${tile}`}>
        <ClipboardPen className="size-6" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-start justify-between gap-2">
          <span className="font-semibold text-slate-900 group-hover:text-brand-700">{a.title}</span>
          <span className="flex flex-wrap gap-1">
            {forTeacher && a.needs_grading_count > 0 && (
              <Badge color="amber">{a.needs_grading_count} perlu dinilai</Badge>
            )}
            {forTeacher ? (
              <Badge color={a.is_published ? 'green' : 'gray'}>
                {a.is_published ? 'Terbit' : 'Draf'}
              </Badge>
            ) : (
              <Badge color={status.color}>{status.label}</Badge>
            )}
          </span>
        </span>
        {showContext && (
          <span className="mt-0.5 block text-xs font-medium text-slate-500">
            {a.subject_name}
            {forTeacher && ` · ${a.classroom_name}`}
          </span>
        )}
        <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <ListChecks className="size-4 text-slate-400" aria-hidden="true" />
            {a.question_count} soal
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Award className="size-4 text-slate-400" aria-hidden="true" />
            {a.max_score} poin
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Timer className="size-4 text-slate-400" aria-hidden="true" />
            {a.duration_minutes ? `${a.duration_minutes} menit` : 'Tanpa batas waktu'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="size-4 text-slate-400" aria-hidden="true" />
            Tenggat {formatDate(a.due_at)}
            <span className="text-slate-500">({dueLabel(a.due_at)})</span>
          </span>
        </span>
        {forTeacher && a.is_published && (
          <ProgressBar
            className="mt-3 max-w-sm"
            value={a.submitted_count}
            max={a.student_count}
            label={`${a.submitted_count} dari ${a.student_count} siswa mengumpulkan`}
          />
        )}
      </span>
      {!forTeacher && (
        <span className="hidden shrink-0 items-center gap-1 self-center rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white group-hover:bg-brand-700 sm:inline-flex">
          {studentAction(a)}
          <ArrowRight className="size-4" aria-hidden="true" />
        </span>
      )}
    </Link>
  )
}
