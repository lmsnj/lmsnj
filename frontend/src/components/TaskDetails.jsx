import { tasksApi } from '../api/tasks'
import { formatDate } from '../utils/media'
import { dueLabel } from '../utils/tasks'
import FileDownloadButton from './FileDownloadButton'

// Kotak info tugas: tenggat, nilai maksimal, instruksi, lampiran. Dipakai guru dan siswa.
export default function TaskDetails({ task }) {
  return (
    <section className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Tenggat</dt>
          <dd className="font-medium text-slate-900">
            {formatDate(task.due_at)}
            <span className="block text-xs font-normal text-slate-500">
              {dueLabel(task.due_at)}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Nilai maksimal</dt>
          <dd className="font-medium text-slate-900">{task.max_score}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Pengumpulan terlambat</dt>
          <dd className="font-medium text-slate-900">
            {task.allow_late ? 'Diterima (ditandai terlambat)' : 'Tidak diterima'}
          </dd>
        </div>
      </dl>
      {task.instructions && (
        <div>
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Instruksi</h2>
          <p className="text-sm whitespace-pre-line text-slate-700">{task.instructions}</p>
        </div>
      )}
      {task.has_attachment && (
        <FileDownloadButton
          fetchBlob={() => tasksApi.attachment(task.id)}
          filename={task.attachment_filename}
        >
          Unduh lampiran: {task.attachment_filename}
        </FileDownloadButton>
      )}
    </section>
  )
}
