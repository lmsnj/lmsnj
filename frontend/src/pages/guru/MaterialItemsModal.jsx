import { ArrowDown, ArrowUp, FileText, Link2, PlayCircle } from 'lucide-react'
import { useState } from 'react'
import { materialItemsApi } from '../../api/materials'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import DeleteDialog from '../../components/DeleteDialog'
import EmptyState from '../../components/EmptyState'
import FileInput, { UploadProgress } from '../../components/FileInput'
import FormModal from '../../components/FormModal'
import Modal from '../../components/Modal'
import TextField from '../../components/TextField'
import useFormSubmit from '../../hooks/useFormSubmit'
import { CONTENT_TYPES, MATERIAL_TYPES } from '../../utils/constants'
import { getErrorMessage } from '../../utils/errors'
import { moveItem } from '../../utils/learningPath'

const ICONS = { pdf: FileText, video: PlayCircle, link: Link2 }
const URL_HINTS = {
  video: 'Tempel link YouTube (akan diputar langsung) atau link video lain.',
  link: 'Contoh: artikel, Google Drive, atau situs latihan.',
}

// Form tambah/ubah satu konten tambahan (tipe, judul, file PDF atau URL).
function ItemFormModal({ materialId, item, onClose, onSaved }) {
  const isEdit = Boolean(item)
  const [form, setForm] = useState({
    title: item?.title ?? '',
    material_type: item?.material_type ?? 'video',
    url: item?.url ?? '',
  })
  const [file, setFile] = useState(null)
  const [progress, setProgress] = useState(null)

  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const data = { ...form }
    if (file) data.file = file
    if (!isEdit) data.material = materialId
    setProgress(file ? 0 : null)
    try {
      const saved = isEdit
        ? await materialItemsApi.update(item.id, data, setProgress)
        : await materialItemsApi.create(data, setProgress)
      onSaved(saved, isEdit)
    } finally {
      setProgress(null)
    }
  })

  const handleChange = (event) => setForm({ ...form, [event.target.name]: event.target.value })
  const isPdf = form.material_type === 'pdf'
  // Mengganti tipe ke PDF butuh file baru jika konten ini belum punya file.
  const needsFile = isPdf && !(item?.has_file && item.material_type === 'pdf')

  return (
    <FormModal
      title={isEdit ? 'Ubah Konten' : 'Tambah Konten'}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError || errors.material}
    >
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-slate-700">Jenis konten</legend>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(CONTENT_TYPES).map(([value, { label }]) => (
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
        placeholder="Contoh: Video Pengantar, Ringkasan Materi"
        required
      />
      {isPdf ? (
        <FileInput
          label="File PDF"
          accept="application/pdf,.pdf"
          onChange={setFile}
          error={errors.file}
          required={needsFile}
          hint={
            needsFile
              ? undefined
              : `File saat ini: ${item.original_filename}. Pilih file baru hanya jika ingin mengganti.`
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
      <UploadProgress value={progress} />
    </FormModal>
  )
}

/**
 * Kelola konten tambahan satu materi (mis. video pengantar + PDF ringkasan). Konten utama tetap
 * diatur di form materi. Siswa melihat semua konten berurutan dan harus membuka semuanya.
 * `onChanged()` dipanggil setiap ada perubahan agar daftar materi dimuat ulang.
 */
export default function MaterialItemsModal({ material, onClose, onChanged }) {
  const [items, setItems] = useState(material.items ?? [])
  // { type: 'form' | 'delete', item }
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState({ type: 'success', text: '' })
  const closeDialog = () => setDialog(null)

  const move = async (index, delta) => {
    const reordered = moveItem(items, index, delta)
    try {
      await materialItemsApi.reorder(
        material.id,
        reordered.map((item) => item.id),
      )
      setItems(reordered)
      onChanged()
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err) })
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={`Konten Materi: ${material.title}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          <Button onClick={() => setDialog({ type: 'form', item: null })}>+ Tambah Konten</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Satu materi boleh berisi beberapa konten, misalnya video pengantar lalu dokumen PDF. Siswa
          membukanya berurutan dan harus membuka <strong>semua</strong> konten agar syarat
          &ldquo;membuka materi&rdquo; terpenuhi.
        </p>
        <Alert type={notice.type}>{notice.text}</Alert>
        <ol className="space-y-2">
          <li className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
            <span className="text-sm font-semibold text-slate-500">1.</span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-medium text-slate-900">{material.title}</span>
              <span className="block text-xs text-slate-500">
                Konten utama ({MATERIAL_TYPES[material.material_type]?.label}), diubah lewat tombol
                &ldquo;Ubah&rdquo; materi
              </span>
            </span>
          </li>
          {items.map((item, index) => {
            const Icon = ICONS[item.material_type]
            return (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-slate-200"
              >
                <span className="text-sm font-semibold text-slate-500">{index + 2}.</span>
                <Icon className="size-5 shrink-0 text-slate-600" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium text-slate-900">{item.title}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {MATERIAL_TYPES[item.material_type]?.label} &middot;{' '}
                    {item.material_type === 'pdf' ? item.original_filename : item.url}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Naikkan urutan ${item.title}`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Turunkan urutan ${item.title}`}
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDialog({ type: 'form', item })}
                  >
                    Ubah
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => setDialog({ type: 'delete', item })}
                  >
                    Hapus
                  </Button>
                </span>
              </li>
            )
          })}
        </ol>
        {items.length === 0 && (
          <EmptyState title="Belum ada konten tambahan.">
            Klik &ldquo;Tambah Konten&rdquo; untuk menambahkan video, PDF, atau link lain ke materi
            ini.
          </EmptyState>
        )}
      </div>

      {dialog?.type === 'form' && (
        <ItemFormModal
          materialId={material.id}
          item={dialog.item}
          onClose={closeDialog}
          onSaved={(saved, isEdit) => {
            closeDialog()
            setItems(isEdit ? items.map((i) => (i.id === saved.id ? saved : i)) : [...items, saved])
            setNotice({
              type: 'success',
              text: `Konten "${saved.title}" ${isEdit ? 'diperbarui' : 'ditambahkan'}.`,
            })
            onChanged()
          }}
        />
      )}
      <DeleteDialog
        item={dialog?.type === 'delete' ? dialog.item : null}
        title="Hapus Konten"
        message={(item) => `Hapus konten "${item.title}"? File yang diunggah juga akan dihapus.`}
        onDelete={(item) => materialItemsApi.remove(item.id)}
        onDeleted={(item) => {
          closeDialog()
          setItems(items.filter((i) => i.id !== item.id))
          setNotice({ type: 'success', text: `Konten "${item.title}" dihapus.` })
          onChanged()
        }}
        onClose={closeDialog}
      />
    </Modal>
  )
}
