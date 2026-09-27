import { useState } from 'react'
import { tasksApi } from '../../api/tasks'
import FileInput, { UploadProgress } from '../../components/FileInput'
import FormModal from '../../components/FormModal'
import TextAreaField from '../../components/TextAreaField'
import TextField from '../../components/TextField'
import useFormSubmit from '../../hooks/useFormSubmit'
import { TASK_FILE_ACCEPT } from '../../utils/constants'
import { defaultDueAt, fromDatetimeLocal, toDatetimeLocal } from '../../utils/tasks'

export default function TaskFormModal({ task, assignmentId, onClose, onSaved }) {
  const isEdit = Boolean(task)
  const [form, setForm] = useState({
    title: task?.title ?? '',
    instructions: task?.instructions ?? '',
    due_at: task ? toDatetimeLocal(task.due_at) : defaultDueAt(),
    max_score: task?.max_score ?? 100,
    allow_late: task?.allow_late ?? true,
    is_published: task?.is_published ?? false,
  })
  const [attachment, setAttachment] = useState(null)
  const [removeAttachment, setRemoveAttachment] = useState(false)
  const [progress, setProgress] = useState(null)

  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const data = { ...form, due_at: fromDatetimeLocal(form.due_at) }
    if (attachment) data.attachment = attachment
    else if (removeAttachment) data.remove_attachment = true
    if (!isEdit) data.teaching_assignment = assignmentId
    setProgress(attachment ? 0 : null)
    try {
      const saved = isEdit
        ? await tasksApi.update(task.id, data, setProgress)
        : await tasksApi.create(data, setProgress)
      onSaved(saved, isEdit)
    } finally {
      setProgress(null)
    }
  })

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value })
  }

  return (
    <FormModal
      title={isEdit ? 'Ubah Tugas' : 'Buat Tugas'}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError}
    >
      <TextField
        label="Judul tugas"
        name="title"
        value={form.title}
        onChange={handleChange}
        error={errors.title}
        required
      />
      <TextAreaField
        label="Instruksi"
        name="instructions"
        value={form.instructions}
        onChange={handleChange}
        error={errors.instructions}
        rows={5}
        placeholder="Jelaskan apa yang harus dikerjakan dan format yang dikumpulkan."
      />
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <TextField
          label="Tenggat"
          name="due_at"
          type="datetime-local"
          value={form.due_at}
          onChange={handleChange}
          error={errors.due_at}
          required
        />
        <TextField
          label="Nilai maksimal"
          name="max_score"
          type="number"
          min={1}
          max={1000}
          value={form.max_score}
          onChange={handleChange}
          error={errors.max_score}
          className="sm:w-32"
          required
        />
      </div>

      <FileInput
        label="Lampiran soal (opsional)"
        accept={TASK_FILE_ACCEPT}
        onChange={setAttachment}
        error={errors.attachment}
        hint={
          task?.has_attachment
            ? `Lampiran saat ini: ${task.attachment_filename}. Pilih file baru untuk mengganti.`
            : undefined
        }
      />
      {task?.has_attachment && !attachment && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={removeAttachment}
            onChange={(event) => setRemoveAttachment(event.target.checked)}
            className="size-4 rounded border-slate-300"
          />
          Hapus lampiran saat ini
        </label>
      )}

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="allow_late"
            checked={form.allow_late}
            onChange={handleChange}
            className="size-4 rounded border-slate-300"
          />
          Terima pengumpulan setelah tenggat (ditandai terlambat)
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="is_published"
            checked={form.is_published}
            onChange={handleChange}
            className="size-4 rounded border-slate-300"
          />
          Terbitkan sekarang (siswa langsung bisa melihat)
        </label>
      </div>

      <UploadProgress value={progress} />
    </FormModal>
  )
}
