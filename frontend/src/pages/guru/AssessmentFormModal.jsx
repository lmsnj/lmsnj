import { useState } from 'react'
import { assessmentsApi } from '../../api/assessments'
import AssignmentSelect from '../../components/AssignmentSelect'
import FormModal from '../../components/FormModal'
import TextAreaField from '../../components/TextAreaField'
import TextField from '../../components/TextField'
import useFormSubmit from '../../hooks/useFormSubmit'
import { defaultDueAt, fromDatetimeLocal, toDatetimeLocal } from '../../utils/tasks'

// Info lembar asesmen (judul, tenggat, durasi). Soal ditambahkan di halaman editor.
export default function AssessmentFormModal({ assessment, assignmentId, onClose, onSaved }) {
  const isEdit = Boolean(assessment)
  const [form, setForm] = useState({
    teaching_assignment: assignmentId ?? '',
    title: assessment?.title ?? '',
    instructions: assessment?.instructions ?? '',
    due_at: assessment ? toDatetimeLocal(assessment.due_at) : defaultDueAt(),
    duration_minutes: assessment?.duration_minutes ?? '',
    show_answers: assessment?.show_answers ?? true,
    max_violations: assessment?.max_violations ?? 3,
    require_fullscreen: assessment?.require_fullscreen ?? false,
  })

  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const data = {
      ...form,
      due_at: fromDatetimeLocal(form.due_at),
      duration_minutes: form.duration_minutes === '' ? null : Number(form.duration_minutes),
      max_violations: Number(form.max_violations) || 0,
    }
    if (isEdit) delete data.teaching_assignment
    const saved = isEdit
      ? await assessmentsApi.update(assessment.id, data)
      : await assessmentsApi.create(data)
    onSaved(saved, isEdit)
  })

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value })
  }

  return (
    <FormModal
      title={isEdit ? 'Ubah Info Asesmen' : 'Buat Lembar Asesmen'}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError}
      submitLabel={isEdit ? 'Simpan' : 'Simpan & Tambah Soal'}
    >
      {!isEdit && (
        <AssignmentSelect
          label="Kelas & mapel"
          value={form.teaching_assignment}
          onChange={(value) => setForm({ ...form, teaching_assignment: value })}
          placeholder="- Pilih kelas & mapel -"
          error={errors.teaching_assignment}
          required
        />
      )}
      <TextField
        label="Judul"
        name="title"
        value={form.title}
        onChange={handleChange}
        error={errors.title}
        placeholder="contoh: Kuis 1 — Dasar HTML"
        required
      />
      <TextAreaField
        label="Petunjuk (opsional)"
        name="instructions"
        value={form.instructions}
        onChange={handleChange}
        rows={3}
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
          label="Durasi (menit)"
          name="duration_minutes"
          type="number"
          min={5}
          max={300}
          value={form.duration_minutes}
          onChange={handleChange}
          error={errors.duration_minutes}
          hint="Kosongkan = tanpa batas waktu"
          className="sm:w-40"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="show_answers"
          checked={form.show_answers}
          onChange={handleChange}
          className="size-4 rounded border-slate-300"
        />
        Tampilkan kunci jawaban ke siswa setelah tenggat lewat
      </label>

      <fieldset className="space-y-3 rounded-lg p-3 ring-1 ring-slate-200">
        <legend className="px-1 text-sm font-semibold text-slate-800">Pengawasan ujian</legend>
        <p className="text-xs text-slate-500">
          Pindah tab, membuka aplikasi lain, dan meninggalkan halaman selalu dicatat dan terlihat di
          tab Hasil.
        </p>
        <TextField
          label="Kumpulkan otomatis setelah keluar halaman (kali)"
          name="max_violations"
          type="number"
          min={0}
          max={20}
          value={form.max_violations}
          onChange={handleChange}
          error={errors.max_violations}
          hint="0 = hanya peringatan & dicatat, tidak dikumpulkan otomatis."
          className="sm:w-72"
        />
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="require_fullscreen"
            checked={form.require_fullscreen}
            onChange={handleChange}
            className="mt-0.5 size-4 rounded border-slate-300"
          />
          <span>
            Wajib layar penuh (laptop/PC). Keluar dari layar penuh dihitung pelanggaran. Tidak
            berlaku di iPhone yang tidak mendukung layar penuh.
          </span>
        </label>
      </fieldset>
      {isEdit || (
        <p className="text-xs text-slate-500">
          Asesmen disimpan sebagai draf. Terbitkan setelah semua soal selesai dibuat.
        </p>
      )}
    </FormModal>
  )
}
