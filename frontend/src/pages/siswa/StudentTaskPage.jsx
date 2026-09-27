import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { tasksApi } from '../../api/tasks'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import DeleteDialog from '../../components/DeleteDialog'
import FileInput, { UploadProgress } from '../../components/FileInput'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import SubmissionView from '../../components/SubmissionView'
import TaskDetails from '../../components/TaskDetails'
import TextAreaField from '../../components/TextAreaField'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'
import { TASK_FILE_ACCEPT } from '../../utils/constants'
import { canSubmit, studentTaskStatus } from '../../utils/tasks'

function SubmitForm({ task, onSubmitted }) {
  const existing = task.my_submission
  const [text, setText] = useState(existing?.text_answer ?? '')
  const [file, setFile] = useState(null)
  const [progress, setProgress] = useState(null)

  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const data = { text_answer: text }
    if (file) data.file = file
    setProgress(file ? 0 : null)
    try {
      await tasksApi.submit(task.id, data, setProgress)
      onSubmitted(existing ? 'Jawaban berhasil diperbarui.' : 'Tugas berhasil dikumpulkan.')
    } finally {
      setProgress(null)
    }
  })

  return (
    <form onSubmit={submit} className="space-y-4">
      <Alert type="error">{generalError}</Alert>
      {task.is_past_due && (
        <Alert type="info">
          Tenggat sudah lewat. Tugas masih bisa dikumpulkan sekali, tetapi akan ditandai{' '}
          <strong>terlambat</strong> dan tidak bisa diubah lagi.
        </Alert>
      )}
      <TextAreaField
        label="Jawaban teks (opsional jika mengunggah file)"
        value={text}
        onChange={(event) => setText(event.target.value)}
        error={errors.text_answer}
        rows={6}
      />
      <FileInput
        label="File jawaban (opsional jika menulis jawaban teks)"
        accept={TASK_FILE_ACCEPT}
        onChange={setFile}
        error={errors.file}
        hint={
          existing?.has_file
            ? `File saat ini: ${existing.original_filename}. Pilih file baru hanya jika ingin mengganti.`
            : undefined
        }
      />
      <UploadProgress value={progress} />
      <Button type="submit" loading={submitting}>
        {existing ? 'Perbarui Jawaban' : 'Kumpulkan Tugas'}
      </Button>
    </form>
  )
}

export default function StudentTaskPage() {
  const { id } = useParams()
  const task = useFetch(tasksApi.get, id)
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  if (task.error) {
    return (
      <Alert type="error">
        {task.error}{' '}
        <Link to="/siswa/mapel" className="font-medium underline">
          Kembali
        </Link>
      </Alert>
    )
  }
  if (!task.data) {
    return (
      <div className="py-10 text-center text-brand-600">
        <Spinner />
      </div>
    )
  }

  const t = task.data
  const status = studentTaskStatus(t)
  const submission = t.my_submission
  const graded = submission?.score !== null && submission?.score !== undefined
  const allowed = canSubmit(t)
  const showForm = allowed && (!submission || editing)

  const done = (message) => {
    setEditing(false)
    setNotice(message)
    task.reload()
  }

  return (
    <>
      <Link
        to={`/siswa/mapel/${t.teaching_assignment}?tab=tugas`}
        className="mb-2 inline-block text-sm text-brand-700 hover:underline"
      >
        ← {t.subject_name}
      </Link>
      <PageHeader
        title={t.title}
        description={<Badge color={status.color}>{status.label}</Badge>}
      />

      <Alert type="success" className="mb-4">
        {notice}
      </Alert>

      <TaskDetails task={t} />

      <section className="mt-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 font-semibold text-slate-900">Pengumpulan Saya</h2>

        {submission && !editing && (
          <>
            <SubmissionView submission={submission} showGrade />
            <div className="mt-4 flex flex-wrap gap-2">
              {allowed && (
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Ganti Jawaban
                </Button>
              )}
              {!t.is_past_due && !graded && (
                <Button
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => setConfirmCancel(true)}
                >
                  Batalkan Pengumpulan
                </Button>
              )}
            </div>
            {(t.is_past_due || graded) && (
              <p className="mt-3 text-xs text-slate-500">
                {graded
                  ? 'Jawaban sudah dinilai guru, jadi tidak bisa diubah lagi.'
                  : 'Tenggat sudah lewat, jawaban tidak bisa diubah lagi.'}
              </p>
            )}
          </>
        )}

        {showForm && <SubmitForm task={t} onSubmitted={done} />}
        {editing && (
          <Button variant="ghost" className="mt-2" onClick={() => setEditing(false)}>
            Batal mengganti
          </Button>
        )}

        {!submission && !allowed && (
          <Alert type="error">
            Tenggat sudah lewat dan guru tidak menerima pengumpulan terlambat.
          </Alert>
        )}
      </section>

      <DeleteDialog
        item={confirmCancel ? t : null}
        title="Batalkan Pengumpulan"
        message={() =>
          'Jawaban dan file yang sudah dikumpulkan akan dihapus. Anda bisa mengumpulkan lagi sebelum tenggat.'
        }
        onDelete={(item) => tasksApi.cancelSubmission(item.id)}
        onDeleted={() => {
          setConfirmCancel(false)
          done('Pengumpulan dibatalkan.')
        }}
        onClose={() => setConfirmCancel(false)}
      />
    </>
  )
}
