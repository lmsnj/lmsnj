import { useState } from 'react'
import { materialsApi } from '../../api/materials'
import FileInput, { UploadProgress } from '../../components/FileInput'
import FormModal from '../../components/FormModal'
import TextAreaField from '../../components/TextAreaField'
import TextField from '../../components/TextField'
import useFormSubmit from '../../hooks/useFormSubmit'
import { MATERIAL_TYPES } from '../../utils/constants'

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
  })
  const [file, setFile] = useState(null)
  const [progress, setProgress] = useState(null)

  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const data = { ...form }
    if (file) data.file = file
    if (!isEdit) data.teaching_assignment = assignmentId
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
