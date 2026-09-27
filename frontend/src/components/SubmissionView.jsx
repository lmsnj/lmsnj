import { submissionsApi } from '../api/tasks'
import { formatDate } from '../utils/media'
import { formatScore } from '../utils/tasks'
import Badge from './Badge'
import FileDownloadButton from './FileDownloadButton'

// Isi satu pengumpulan: waktu, status, jawaban teks, file, dan (opsional) nilai.
// `showGrade` dipakai di halaman siswa; guru melihat nilai di form penilaian.
export default function SubmissionView({ submission, showGrade }) {
  return (
    <div className="space-y-3 text-sm">
      {showGrade && submission.score !== null && (
        <div className="rounded-lg bg-brand-50 p-4 ring-1 ring-brand-100">
          <p className="text-xs font-medium text-brand-800 uppercase">Nilai</p>
          <p className="text-3xl font-bold text-brand-800">
            {formatScore(submission.score)}
            <span className="text-base font-normal text-brand-700">/{submission.max_score}</span>
          </p>
          {submission.feedback && (
            <p className="mt-2 whitespace-pre-line text-slate-700">
              <span className="font-medium">Umpan balik {submission.graded_by_name}:</span>{' '}
              {submission.feedback}
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-slate-600">
        <span>Dikumpulkan {formatDate(submission.submitted_at)}</span>
        <Badge color={submission.is_late ? 'amber' : 'green'}>
          {submission.is_late ? 'Terlambat' : 'Tepat waktu'}
        </Badge>
      </div>
      {submission.text_answer && (
        <div className="rounded-lg bg-slate-50 p-3 whitespace-pre-wrap text-slate-800 ring-1 ring-slate-200">
          {submission.text_answer}
        </div>
      )}
      {submission.has_file && (
        <FileDownloadButton
          fetchBlob={() => submissionsApi.download(submission.id)}
          filename={submission.original_filename}
        />
      )}
    </div>
  )
}
