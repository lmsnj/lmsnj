import { ArrowDown, ArrowUp, ClipboardCheck } from 'lucide-react'
import { useState } from 'react'
import { assessmentsApi } from '../../api/assessments'
import { chaptersApi } from '../../api/materials'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import DeleteDialog from '../../components/DeleteDialog'
import EmptyState from '../../components/EmptyState'
import FormModal from '../../components/FormModal'
import Modal from '../../components/Modal'
import SelectField from '../../components/SelectField'
import Spinner from '../../components/Spinner'
import TextAreaField from '../../components/TextAreaField'
import TextField from '../../components/TextField'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'
import { ALL, toOptions } from '../../utils/academic'
import { getErrorMessage } from '../../utils/errors'
import { moveItem } from '../../utils/learningPath'

// Form tambah/ubah satu bab: judul, "yang akan dipelajari", dan Post Test (asesmen kelas-mapel ini).
function ChapterFormModal({ assignmentId, chapter, onClose, onSaved }) {
  const isEdit = Boolean(chapter)
  const [form, setForm] = useState({
    title: chapter?.title ?? '',
    description: chapter?.description ?? '',
    post_test: chapter?.post_test ? String(chapter.post_test) : '',
  })
  const assessments = useFetch(assessmentsApi.list, { ...ALL, teaching_assignment: assignmentId })

  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const data = { ...form, post_test: form.post_test ? Number(form.post_test) : null }
    const saved = isEdit
      ? await chaptersApi.update(chapter.id, data)
      : await chaptersApi.create({ ...data, teaching_assignment: assignmentId })
    onSaved(saved, isEdit)
  })
  const handleChange = (event) => setForm({ ...form, [event.target.name]: event.target.value })

  return (
    <FormModal
      title={isEdit ? 'Ubah Bab' : 'Tambah Bab'}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError || errors.teaching_assignment}
    >
      <TextField
        label="Judul bab"
        name="title"
        value={form.title}
        onChange={handleChange}
        error={errors.title}
        placeholder="Contoh: Dasar-dasar HTML"
        required
      />
      <TextAreaField
        label="Yang akan dipelajari (opsional, satu per baris)"
        name="description"
        value={form.description}
        onChange={handleChange}
        error={errors.description}
        rows={4}
        placeholder={'Mengenal struktur dokumen HTML\nMembuat halaman web sederhana'}
      />
      <SelectField
        label="Post Test (opsional)"
        name="post_test"
        value={form.post_test}
        onChange={handleChange}
        options={toOptions(
          assessments.data?.results,
          (a) => (a.passing_score !== null ? `${a.title} (KKM ${a.passing_score})` : a.title),
          '- Tanpa Post Test -',
        )}
        error={errors.post_test}
        hint="Pilih lembar asesmen kelas ini (buat dulu di menu Asesmen). Siswa baru bisa mengerjakannya setelah semua materi bab tercapai, dan bab berikutnya terbuka setelah Post Test tuntas KKM. Post Test berstatus draf tidak menahan siswa."
      />
    </FormModal>
  )
}

/**
 * Kelola bab satu kelas-mapel: tambah/ubah/hapus, urutan, dan Post Test. Materi dimasukkan ke bab
 * lewat form materi (pilihan "Bab"). Menghapus bab tidak menghapus materinya.
 * `onChanged()` dipanggil setiap ada perubahan agar daftar materi dimuat ulang.
 */
export default function ChaptersModal({ assignmentId, onClose, onChanged }) {
  const chapters = useFetch(chaptersApi.list, { ...ALL, teaching_assignment: assignmentId })
  // { type: 'form' | 'delete', chapter }
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState({ type: 'success', text: '' })
  const list = chapters.data?.results ?? []
  const closeDialog = () => setDialog(null)
  const changed = (text) => {
    closeDialog()
    setNotice({ type: 'success', text })
    chapters.reload()
    onChanged()
  }

  const move = async (index, delta) => {
    try {
      await chaptersApi.reorder(
        assignmentId,
        moveItem(list, index, delta).map((chapter) => chapter.id),
      )
      chapters.reload()
      onChanged()
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err) })
    }
  }

  return (
    <Modal
      open
      size="lg"
      title="Bab Pembelajaran"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          <Button onClick={() => setDialog({ type: 'form', chapter: null })}>+ Tambah Bab</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Kelompokkan materi ke dalam bab, lalu tutup setiap bab dengan Post Test. Siswa mempelajari
          bab sesuai urutan; bab berikutnya terbuka setelah Post Test bab sebelumnya tuntas. Materi
          dimasukkan ke bab lewat tombol &ldquo;Ubah&rdquo; materi (pilihan &ldquo;Bab&rdquo;).
        </p>
        <Alert type={notice.type}>{notice.text}</Alert>
        <Alert type="error">{chapters.error}</Alert>
        {!chapters.data && chapters.loading ? (
          <div className="py-8 text-center text-brand-600">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <EmptyState title="Belum ada bab.">
            Tanpa bab, siswa melihat materi sebagai satu daftar berurutan seperti biasa.
          </EmptyState>
        ) : (
          <ol className="space-y-2">
            {list.map((chapter, index) => (
              <li
                key={chapter.id}
                className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-slate-200"
              >
                <span className="text-sm font-semibold text-slate-500">Bab {index + 1}</span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium text-slate-900">{chapter.title}</span>
                  <span className="block text-xs text-slate-500">
                    {chapter.material_count} materi &middot;{' '}
                    {chapter.post_test ? (
                      <span className="inline-flex items-center gap-1">
                        <ClipboardCheck className="size-3.5" aria-hidden="true" />
                        Post Test: {chapter.post_test_title}
                        {!chapter.post_test_published && ' (draf)'}
                      </span>
                    ) : (
                      'tanpa Post Test'
                    )}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Naikkan urutan ${chapter.title}`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Turunkan urutan ${chapter.title}`}
                    disabled={index === list.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDialog({ type: 'form', chapter })}
                  >
                    Ubah
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => setDialog({ type: 'delete', chapter })}
                  >
                    Hapus
                  </Button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {dialog?.type === 'form' && (
        <ChapterFormModal
          assignmentId={assignmentId}
          chapter={dialog.chapter}
          onClose={closeDialog}
          onSaved={(saved, isEdit) =>
            changed(`Bab "${saved.title}" ${isEdit ? 'diperbarui' : 'ditambahkan'}.`)
          }
        />
      )}
      <DeleteDialog
        item={dialog?.type === 'delete' ? dialog.chapter : null}
        title="Hapus Bab"
        message={(c) =>
          `Hapus bab "${c.title}"? Materinya TIDAK ikut terhapus, hanya menjadi materi tanpa bab.`
        }
        onDelete={(c) => chaptersApi.remove(c.id)}
        onDeleted={(c) => changed(`Bab "${c.title}" dihapus.`)}
        onClose={closeDialog}
      />
    </Modal>
  )
}
