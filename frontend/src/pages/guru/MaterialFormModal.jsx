import TemplatePicker from '../../components/TemplatePicker'
import { MATERIAL_TEMPLATES } from '../../utils/formTemplates'
import { useState } from 'react'
import { assessmentsApi } from '../../api/assessments'
import { materialsApi } from '../../api/materials'
import { tasksApi } from '../../api/tasks'
import AssignmentSelect from '../../components/AssignmentSelect'
import FileInput, { UploadProgress } from '../../components/FileInput'
import FormModal from '../../components/FormModal'
import SelectField from '../../components/SelectField'
import TextAreaField from '../../components/TextAreaField'
import TextField from '../../components/TextField'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'
import { ALL, toOptions } from '../../utils/academic'
import { MATERIAL_TYPES } from '../../utils/constants'
import { parseObjectives } from '../../utils/learningPath'

// Daftar tugas/asesmen satu kelas-mapel untuk pilihan syarat (kosong jika kelas-mapel belum dipilih).
const listFor = (api) => (params) =>
  params.teaching_assignment ? api.list(params) : Promise.resolve({ results: [] })
const listTasks = listFor(tasksApi)
const listAssessments = listFor(assessmentsApi)

const URL_HINTS = {
  video: 'Tempel link YouTube (akan diputar langsung) atau link video lain.',
  link: 'Contoh: artikel, Google Drive, atau situs latihan.',
}

export default function MaterialFormModal({ material, assignmentId, onClose, onSaved }) {
  const isEdit = Boolean(material)
  const [form, setForm] = useState({
    title: material?.title ?? '',
    description: material?.description ?? '',
    material_type: material?.material_type ?? 'pdf',
    url: material?.url ?? '',
    is_published: material?.is_published ?? false,
    objectives: (material?.objectives ?? []).join('\n'),
    concepts: (material?.concepts ?? []).join('\n'),
    required_task: material?.required_task ? String(material.required_task) : '',
    min_task_score: material?.min_task_score ?? '',
    required_assessment: material?.required_assessment ? String(material.required_assessment) : '',
    require_teacher_approval: material?.require_teacher_approval ?? false,
    // Materi baru: refleksi wajib (bawaan).
    require_reflection: material?.require_reflection ?? true,
  })
  const [file, setFile] = useState(null)
  const [progress, setProgress] = useState(null)
  // Dari halaman kelas-mapel `assignmentId` sudah pasti; dari halaman gabungan guru memilih sendiri.
  const [chosenAssignment, setChosenAssignment] = useState('')
  const assignment = material?.teaching_assignment ?? (assignmentId || chosenAssignment)
  const contentParams = { ...ALL, teaching_assignment: assignment || null }
  const tasks = useFetch(listTasks, contentParams)
  const assessments = useFetch(listAssessments, contentParams)

  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const data = {
      ...form,
      // Dikirim sebagai teks JSON agar tetap terbaca saat form berisi file (multipart).
      objectives: JSON.stringify(parseObjectives(form.objectives)),
      concepts: JSON.stringify(parseObjectives(form.concepts)),
      required_task: form.required_task ? Number(form.required_task) : null,
      min_task_score:
        form.required_task && form.min_task_score !== '' ? Number(form.min_task_score) : null,
      required_assessment: form.required_assessment ? Number(form.required_assessment) : null,
    }
    if (file) data.file = file
    if (!isEdit) data.teaching_assignment = assignmentId || chosenAssignment
    setProgress(file ? 0 : null)
    try {
      const saved = isEdit
        ? await materialsApi.update(material.id, data, setProgress)
        : await materialsApi.create(data, setProgress)
      onSaved(saved, isEdit)
    } finally {
      setProgress(null)
    }
  })

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value })
  }

  const isPdf = form.material_type === 'pdf'

  return (
    <FormModal
      title={isEdit ? 'Ubah Materi' : 'Tambah Materi'}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError}
    >
      <TemplatePicker
        templates={MATERIAL_TEMPLATES}
        onPick={(values) => setForm((f) => ({ ...f, ...values }))}
      />
      {!isEdit && !assignmentId && (
        <AssignmentSelect
          label="Kelas & mapel"
          value={chosenAssignment}
          onChange={setChosenAssignment}
          placeholder="- Pilih kelas & mapel -"
          error={errors.teaching_assignment}
          required
        />
      )}
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-slate-700">Jenis materi</legend>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(MATERIAL_TYPES).map(([value, { label }]) => (
            <label
              key={value}
              className={`cursor-pointer rounded-lg px-3 py-2 text-center text-sm font-medium ring-1 ${
                form.material_type === value
                  ? 'bg-brand-50 text-brand-800 ring-brand-600'
                  : 'text-slate-600 ring-slate-300 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="material_type"
                value={value}
                checked={form.material_type === value}
                onChange={handleChange}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <TextField
        label="Judul"
        name="title"
        value={form.title}
        onChange={handleChange}
        error={errors.title}
        required
      />
      <TextAreaField
        label="Deskripsi (opsional)"
        name="description"
        value={form.description}
        onChange={handleChange}
        error={errors.description}
        rows={3}
      />

      {isPdf ? (
        <FileInput
          label="File PDF"
          accept="application/pdf,.pdf"
          onChange={setFile}
          error={errors.file}
          required={!material?.has_file}
          hint={
            material?.has_file
              ? `File saat ini: ${material.original_filename}. Pilih file baru hanya jika ingin mengganti.`
              : undefined
          }
        />
      ) : (
        <TextField
          label="URL"
          name="url"
          type="url"
          value={form.url}
          onChange={handleChange}
          error={errors.url}
          placeholder="https://"
          hint={URL_HINTS[form.material_type]}
          required
        />
      )}

      <fieldset className="space-y-3 rounded-lg bg-sky-50 p-3 ring-1 ring-sky-200">
        <legend className="px-1 text-sm font-semibold text-sky-900">
          Capaian & syarat lanjut ke materi berikutnya
        </legend>
        <p className="text-xs text-sky-900">
          Siswa baru bisa membuka materi berikutnya setelah semua syarat di bawah terpenuhi. Tanpa
          syarat apa pun, cukup materi ini dibuka siswa.
        </p>
        <TextAreaField
          label="Capaian (satu per baris, dicentang siswa)"
          name="objectives"
          value={form.objectives}
          onChange={handleChange}
          error={errors.objectives}
          rows={3}
          placeholder={
            'Saya bisa menyebutkan 5 tag HTML dasar\nSaya bisa membuat halaman web sederhana'
          }
        />
        <TextAreaField
          label="Konsep kunci untuk asesmen otomatis (opsional, satu per baris: istilah = penjelasan)"
          name="concepts"
          value={form.concepts}
          onChange={handleChange}
          error={errors.concepts}
          rows={4}
          hint="Minimal 4 konsep. Dipakai tombol “Asesmen Otomatis” untuk membuat soal jodohkan, pilihan ganda, isian, dan benar/salah. Tidak terlihat oleh siswa."
          placeholder={
            'Algoritma = Urutan langkah logis untuk menyelesaikan masalah\nBerhingga = Algoritma harus berhenti setelah sejumlah langkah'
          }
        />
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <SelectField
            label="Syarat tugas"
            name="required_task"
            value={form.required_task}
            onChange={handleChange}
            options={toOptions(tasks.data?.results, (t) => t.title, '- Tanpa syarat tugas -')}
            error={errors.required_task}
            disabled={!assignment}
          />
          <TextField
            label="Nilai minimal"
            name="min_task_score"
            type="number"
            min={0}
            max={100}
            value={form.min_task_score}
            onChange={handleChange}
            error={errors.min_task_score}
            placeholder="cukup kumpul"
            disabled={!form.required_task}
          />
        </div>
        <SelectField
          label="Syarat asesmen (harus tuntas KKM)"
          name="required_assessment"
          value={form.required_assessment}
          onChange={handleChange}
          options={toOptions(
            assessments.data?.results,
            (a) => (a.passing_score !== null ? `${a.title} (KKM ${a.passing_score})` : a.title),
            '- Tanpa syarat asesmen -',
          )}
          error={errors.required_assessment}
          disabled={!assignment}
        />
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="require_teacher_approval"
            checked={form.require_teacher_approval}
            onChange={handleChange}
            className="mt-0.5 size-4 rounded border-slate-300"
          />
          <span>
            Perlu disahkan guru (mis. setelah praktik di kelas). Sahkan lewat tombol
            &ldquo;Progres&rdquo; di daftar materi.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="require_reflection"
            checked={form.require_reflection}
            onChange={handleChange}
            className="mt-0.5 size-4 rounded border-slate-300"
          />
          <span>
            Wajib menulis cerita reflektif (apa yang dipelajari & apa yang masih sulit). Refleksi
            siswa bisa dibaca lewat tombol &ldquo;Progres&rdquo;.
          </span>
        </label>
      </fieldset>

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

      <UploadProgress value={progress} />
    </FormModal>
  )
}
