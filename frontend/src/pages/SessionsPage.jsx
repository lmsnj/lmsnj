import { MapPin, Video } from 'lucide-react'
import { useState } from 'react'
import { sessionsApi } from '../api/sessions'
import Alert from '../components/Alert'
import AssignmentSelect from '../components/AssignmentSelect'
import Badge from '../components/Badge'
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
import { ALL } from '../utils/academic'
import { ROLES } from '../utils/constants'
import { formatDate } from '../utils/media'
import { dueLabel, fromDatetimeLocal, toDatetimeLocal } from '../utils/tasks'

const STATUS = {
  upcoming: { label: 'Akan datang', color: 'blue' },
  ongoing: { label: 'Sedang berlangsung', color: 'green' },
  done: { label: 'Selesai', color: 'gray' },
}

function defaultStart() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(7, 30, 0, 0)
  return toDatetimeLocal(date)
}

function SessionFormModal({ session, onClose, onSaved }) {
  const [form, setForm] = useState({
    teaching_assignment: session ? String(session.teaching_assignment) : '',
    title: session?.title ?? '',
    description: session?.description ?? '',
    starts_at: session ? toDatetimeLocal(session.starts_at) : defaultStart(),
    duration_minutes: session?.duration_minutes ?? 90,
    mode: session?.mode ?? 'offline',
    location: session?.location ?? '',
    meeting_url: session?.meeting_url ?? '',
  })
  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const data = { ...form, starts_at: fromDatetimeLocal(form.starts_at) }
    if (session) delete data.teaching_assignment
    const saved = session
      ? await sessionsApi.update(session.id, data)
      : await sessionsApi.create(data)
    onSaved(saved, Boolean(session))
  })
  const handleChange = (event) => setForm({ ...form, [event.target.name]: event.target.value })

  return (
    <FormModal
      title={session ? 'Ubah Sesi' : 'Buat Sesi Mengajar'}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError}
    >
      {!session && (
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
        label="Topik"
        name="title"
        value={form.title}
        onChange={handleChange}
        error={errors.title}
        placeholder="contoh: Praktik membuat tabel HTML"
        required
      />
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <TextField
          label="Mulai"
          name="starts_at"
          type="datetime-local"
          value={form.starts_at}
          onChange={handleChange}
          error={errors.starts_at}
          required
        />
        <TextField
          label="Durasi (menit)"
          name="duration_minutes"
          type="number"
          min={10}
          max={480}
          value={form.duration_minutes}
          onChange={handleChange}
          error={errors.duration_minutes}
          className="sm:w-36"
          required
        />
      </div>
      <SelectField
        label="Jenis pertemuan"
        name="mode"
        value={form.mode}
        onChange={handleChange}
        options={[
          { value: 'offline', label: 'Tatap muka' },
          { value: 'online', label: 'Online (Google Meet, Zoom, dll.)' },
        ]}
      />
      {form.mode === 'online' ? (
        <TextField
          label="Link pertemuan"
          name="meeting_url"
          type="url"
          value={form.meeting_url}
          onChange={handleChange}
          error={errors.meeting_url}
          placeholder="https://meet.google.com/..."
          required
        />
      ) : (
        <TextField
          label="Ruang / tempat (opsional)"
          name="location"
          value={form.location}
          onChange={handleChange}
          error={errors.location}
          placeholder="contoh: Lab RPL 1"
        />
      )}
      <TextAreaField
        label="Catatan untuk siswa (opsional)"
        name="description"
        value={form.description}
        onChange={handleChange}
        rows={3}
      />
    </FormModal>
  )
}

function SessionItem({ session: s, actions }) {
  const status = STATUS[s.status]
  return (
    <li className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={status.color}>{status.label}</Badge>
          <Badge color={s.mode === 'online' ? 'blue' : 'gray'}>{s.mode_display}</Badge>
        </div>
        <p className="mt-1 font-semibold text-slate-900">{s.title}</p>
        <p className="text-sm text-slate-600">
          {s.subject_name} · {s.classroom_name} · {s.teacher_name}
        </p>
        <p className="mt-1 text-sm text-slate-700">
          {formatDate(s.starts_at)} · {s.duration_minutes} menit
          {s.status === 'upcoming' && (
            <span className="text-slate-500"> ({dueLabel(s.starts_at)})</span>
          )}
        </p>
        {s.mode === 'offline' && s.location && (
          <p className="mt-1 flex items-center gap-1 text-sm text-slate-600">
            <MapPin className="size-4" aria-hidden="true" /> {s.location}
          </p>
        )}
        {s.description && (
          <p className="mt-1 text-sm whitespace-pre-line text-slate-600">{s.description}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-1 sm:justify-end">
        {s.mode === 'online' && s.status !== 'done' && (
          <a
            href={s.meeting_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Video className="size-4" aria-hidden="true" /> Gabung
          </a>
        )}
        {actions}
      </div>
    </li>
  )
}

// Jadwal sesi mengajar. Guru: buat/ubah/hapus. Siswa (dan admin): lihat jadwal.
export default function SessionsPage() {
  const { user } = useAuth()
  const isTeacher = user.role === ROLES.TEACHER
  const openForm = useQueryFlag('baru') === '1'
  const [showPast, setShowPast] = useState(false)
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState(
    openForm && isTeacher ? { type: 'form', session: null } : null,
  )

  // Dihitung sekali saat halaman dibuka agar parameter request tidak berubah setiap render.
  const [since] = useState(() => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    return date.toISOString()
  })
  const params = showPast
    ? { ...ALL, starts_at__lte: since, ordering: '-starts_at' }
    : { ...ALL, starts_at__gte: since }
  const sessions = useFetch(sessionsApi.list, params)

  const closeDialog = () => setDialog(null)
  const done = (text) => {
    closeDialog()
    setNotice(text)
    sessions.reload()
  }
  const items = sessions.data?.results

  return (
    <>
      <PageHeader
        title={isTeacher ? 'Sesi Mengajar' : 'Jadwal Sesi'}
        description={
          isTeacher
            ? 'Jadwalkan pertemuan tatap muka atau online untuk kelas Anda.'
            : 'Jadwal pertemuan dari guru di kelas Anda.'
        }
        actions={
          isTeacher && (
            <Button onClick={() => setDialog({ type: 'form', session: null })}>+ Buat Sesi</Button>
          )
        }
      />
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 sm:w-max" role="group">
        {[
          [false, 'Hari ini & mendatang'],
          [true, 'Sudah lewat'],
        ].map(([value, label]) => (
          <button
            key={label}
            type="button"
            aria-pressed={showPast === value}
            onClick={() => setShowPast(value)}
            className={`rounded-md px-3 py-1 text-sm ${showPast === value ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mb-3 space-y-3">
        <Alert type="success">{notice}</Alert>
        <Alert type="error">{sessions.error}</Alert>
      </div>

      {sessions.loading && !items ? (
        <div className="py-10 text-center text-brand-600">
          <Spinner />
        </div>
      ) : !items?.length ? (
        <EmptyState
          title={showPast ? 'Belum ada sesi yang sudah lewat' : 'Belum ada sesi terjadwal'}
        />
      ) : (
        <ul className="space-y-3">
          {items.map((s) => (
            <SessionItem
              key={s.id}
              session={s}
              actions={
                isTeacher && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialog({ type: 'form', session: s })}
                    >
                      Ubah
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => setDialog({ type: 'delete', session: s })}
                    >
                      Hapus
                    </Button>
                  </>
                )
              }
            />
          ))}
        </ul>
      )}

      {dialog?.type === 'form' && (
        <SessionFormModal
          session={dialog.session}
          onClose={closeDialog}
          onSaved={(saved, isEdit) =>
            done(`Sesi "${saved.title}" ${isEdit ? 'diperbarui' : 'dijadwalkan'}.`)
          }
        />
      )}
      <DeleteDialog
        item={dialog?.type === 'delete' ? dialog.session : null}
        title="Hapus Sesi"
        message={(s) => `Hapus sesi "${s.title}" (${formatDate(s.starts_at)})?`}
        onDelete={(s) => sessionsApi.remove(s.id)}
        onDeleted={(s) => done(`Sesi "${s.title}" dihapus.`)}
        onClose={closeDialog}
      />
    </>
  )
}
