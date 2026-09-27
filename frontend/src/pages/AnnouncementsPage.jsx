import TemplatePicker from '../components/TemplatePicker'
import { ANNOUNCEMENT_TEMPLATES } from '../utils/formTemplates'
import { useState } from 'react'
import { assignmentsApi } from '../api/academics'
import { announcementsApi } from '../api/announcements'
import Alert from '../components/Alert'
import AnnouncementCard from '../components/AnnouncementCard'
import Button from '../components/Button'
import DeleteDialog from '../components/DeleteDialog'
import EmptyState from '../components/EmptyState'
import FormModal from '../components/FormModal'
import PageHeader from '../components/PageHeader'
import SelectField from '../components/SelectField'
import Spinner from '../components/Spinner'
import TextAreaField from '../components/TextAreaField'
import TextField from '../components/TextField'
import useAuth from '../hooks/useAuth'
import useFetch from '../hooks/useFetch'
import useFormSubmit from '../hooks/useFormSubmit'
import useQueryFlag from '../hooks/useQueryFlag'
import { ALL, toOptions } from '../utils/academic'
import { ROLES } from '../utils/constants'

const SCHOOL = 'school'

function AnnouncementFormModal({ announcement, targets, onClose, onSaved }) {
  const { user } = useAuth()
  const isAdmin = user.role === ROLES.ADMIN
  const [form, setForm] = useState({
    title: announcement?.title ?? '',
    body: announcement?.body ?? '',
    target: announcement
      ? String(announcement.teaching_assignment ?? SCHOOL)
      : isAdmin
        ? SCHOOL
        : '',
    is_pinned: announcement?.is_pinned ?? false,
  })
  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const data = {
      title: form.title,
      body: form.body,
      is_pinned: form.is_pinned,
      teaching_assignment: form.target === SCHOOL ? null : form.target || null,
    }
    const saved = announcement
      ? await announcementsApi.update(announcement.id, data)
      : await announcementsApi.create(data)
    onSaved(saved, Boolean(announcement))
  })
  const handleChange = (event) => {
    const { name, value, type, checked } = event.target
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value })
  }

  // Admin bisa memilih "Seluruh sekolah"; guru hanya kelas-mapel yang ia ampu.
  const options = [
    isAdmin
      ? { value: SCHOOL, label: 'Seluruh sekolah' }
      : { value: '', label: '- Pilih kelas & mapel -' },
    ...toOptions(targets, (a) => `${a.subject_name} · ${a.classroom_name}`),
  ]

  return (
    <FormModal
      title={announcement ? 'Ubah Pengumuman' : 'Buat Pengumuman'}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError}
    >
      <TemplatePicker
        templates={ANNOUNCEMENT_TEMPLATES}
        onPick={(values) => setForm((f) => ({ ...f, ...values }))}
      />
      <SelectField
        label="Ditujukan untuk"
        name="target"
        value={form.target}
        onChange={handleChange}
        options={options}
        error={errors.teaching_assignment}
        required
      />
      <TextField
        label="Judul"
        name="title"
        value={form.title}
        onChange={handleChange}
        error={errors.title}
        required
      />
      <TextAreaField
        label="Isi pengumuman"
        name="body"
        value={form.body}
        onChange={handleChange}
        error={errors.body}
        rows={6}
        required
      />
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="is_pinned"
          checked={form.is_pinned}
          onChange={handleChange}
          className="size-4 rounded border-slate-300"
        />
        Sematkan di urutan teratas
      </label>
    </FormModal>
  )
}

// Halaman Pengumuman untuk semua peran. Admin & guru bisa membuat; siswa membaca.
export default function AnnouncementsPage() {
  const { user } = useAuth()
  const canPost = user.role !== ROLES.STUDENT
  const openForm = useQueryFlag('baru') === '1'
  const [filter, setFilter] = useState('')
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState(
    openForm && canPost ? { type: 'form', announcement: null } : null,
  )

  const announcements = useFetch(announcementsApi.list, {
    ...ALL,
    teaching_assignment: filter || undefined,
  })
  const targets = useFetch(assignmentsApi.list, ALL)
  const targetList = targets.data?.results ?? []

  const closeDialog = () => setDialog(null)
  const done = (text) => {
    closeDialog()
    setNotice(text)
    announcements.reload()
  }

  const togglePin = async (a) => {
    await announcementsApi.update(a.id, { is_pinned: !a.is_pinned })
    announcements.reload()
  }

  const items = announcements.data?.results
  return (
    <>
      <PageHeader
        title="Pengumuman"
        description="Informasi dari sekolah dan guru."
        actions={
          canPost && (
            <Button onClick={() => setDialog({ type: 'form', announcement: null })}>
              + Buat Pengumuman
            </Button>
          )
        }
      />
      <SelectField
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        options={[
          { value: '', label: 'Semua pengumuman' },
          { value: SCHOOL, label: 'Seluruh sekolah' },
          ...toOptions(targetList, (a) => `${a.subject_name} · ${a.classroom_name}`),
        ]}
        className="mb-4 sm:max-w-sm"
        aria-label="Filter pengumuman"
      />
      <div className="mb-3 space-y-3">
        <Alert type="success">{notice}</Alert>
        <Alert type="error">{announcements.error}</Alert>
      </div>

      {announcements.loading && !items ? (
        <div className="py-10 text-center text-brand-600">
          <Spinner />
        </div>
      ) : !items?.length ? (
        <EmptyState title="Belum ada pengumuman" />
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              actions={
                a.can_edit && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => togglePin(a)}>
                      {a.is_pinned ? 'Lepas sematan' : 'Sematkan'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialog({ type: 'form', announcement: a })}
                    >
                      Ubah
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => setDialog({ type: 'delete', announcement: a })}
                    >
                      Hapus
                    </Button>
                  </>
                )
              }
            />
          ))}
        </div>
      )}

      {dialog?.type === 'form' && (
        <AnnouncementFormModal
          announcement={dialog.announcement}
          targets={targetList}
          onClose={closeDialog}
          onSaved={(saved, isEdit) =>
            done(`Pengumuman "${saved.title}" ${isEdit ? 'diperbarui' : 'diterbitkan'}.`)
          }
        />
      )}
      <DeleteDialog
        item={dialog?.type === 'delete' ? dialog.announcement : null}
        title="Hapus Pengumuman"
        message={(a) => `Hapus pengumuman "${a.title}"?`}
        onDelete={(a) => announcementsApi.remove(a.id)}
        onDeleted={(a) => done(`Pengumuman "${a.title}" dihapus.`)}
        onClose={closeDialog}
      />
    </>
  )
}
