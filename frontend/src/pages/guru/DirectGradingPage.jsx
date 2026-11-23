import { ClipboardPen, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { assignmentsApi } from '../../api/academics'
import { gradeActivitiesApi, gradeTypesApi } from '../../api/grading'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import ClassHero from '../../components/ClassHero'
import DeleteDialog from '../../components/DeleteDialog'
import EmptyState from '../../components/EmptyState'
import FormModal from '../../components/FormModal'
import ScoreGrid from '../../components/grading/ScoreGrid'
import SelectField from '../../components/SelectField'
import Spinner from '../../components/Spinner'
import TextField from '../../components/TextField'
import useFeature from '../../hooks/useFeature'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'
import { ALL } from '../../utils/academic'
import { SCALE_LABELS } from '../../utils/grading'

const today = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD waktu lokal

function Loading() {
  return (
    <div className="py-10 text-center text-brand-600">
      <Spinner />
    </div>
  )
}

function formatDay(value) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(
    new Date(`${value}T00:00`),
  )
}

// Form tambah/ubah kegiatan: jenis, judul, tanggal.
function ActivityForm({ assignmentId, activity, types, onClose, onSaved }) {
  const activeTypes = types.filter((t) => t.is_active || t.id === activity?.grade_type)
  const [form, setForm] = useState({
    grade_type: String(activity?.grade_type ?? activeTypes[0]?.id ?? ''),
    title: activity?.title ?? '',
    date: activity?.date ?? today(),
  })
  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const data = { ...form, grade_type: Number(form.grade_type) }
    const saved = activity
      ? await gradeActivitiesApi.update(activity.id, data)
      : await gradeActivitiesApi.create({ ...data, teaching_assignment: assignmentId })
    onSaved(saved)
  })
  const change = (field) => (event) => setForm({ ...form, [field]: event.target.value })

  return (
    <FormModal
      title={activity ? 'Ubah Penilaian' : 'Penilaian Baru'}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError || errors.teaching_assignment}
      submitLabel={activity ? 'Simpan' : 'Buat & Isi Nilai'}
    >
      <SelectField
        label="Jenis penilaian"
        options={activeTypes.map((t) => ({ value: String(t.id), label: t.name }))}
        value={form.grade_type}
        onChange={change('grade_type')}
        error={errors.grade_type}
      />
      <TextField
        label="Judul"
        placeholder="mis. LKPD Bab 2"
        value={form.title}
        maxLength={150}
        onChange={change('title')}
        error={errors.title}
        required
      />
      <TextField
        label="Tanggal"
        type="date"
        value={form.date}
        onChange={change('date')}
        error={errors.date}
        required
      />
    </FormModal>
  )
}

function ActivityGrid({ activityId, readOnly, onSaved }) {
  const scores = useFetch(gradeActivitiesApi.scores, activityId)
  if (scores.error) return <Alert type="error">{scores.error}</Alert>
  if (!scores.data || scores.loading) return <Loading />
  return (
    <ScoreGrid
      key={activityId}
      activity={scores.data.activity}
      kkm={scores.data.kkm}
      initialRows={scores.data.rows}
      readOnly={readOnly}
      onSaved={onSaved}
    />
  )
}

function GradingContent({ assignment: a }) {
  const enabled = useFeature('penilaian_langsung')
  const [searchParams, setSearchParams] = useSearchParams()
  const activities = useFetch(gradeActivitiesApi.list, { ...ALL, teaching_assignment: a.id })
  const types = useFetch(gradeTypesApi.list)
  const [editing, setEditing] = useState(null) // null | 'new' | kegiatan
  const [deleting, setDeleting] = useState(null)
  const list = activities.data?.results ?? []
  const selectedId = Number(searchParams.get('p')) || null
  const selected = list.find((item) => item.id === selectedId)
  const select = (id) => setSearchParams(id ? { p: String(id) } : {}, { replace: false })
  const noTypes = types.data && !types.data.some((t) => t.is_active)

  const hero = (
    <ClassHero
      back={
        selectedId
          ? { to: `/guru/kelas/${a.id}/penilaian`, label: 'Penilaian Langsung' }
          : { to: `/guru/kelas/${a.id}`, label: a.classroom_name }
      }
      title={selected ? selected.title : 'Penilaian Langsung'}
      subject={a.subject_name}
      info={[
        a.classroom_name,
        selected
          ? `${selected.grade_type_name} · ${formatDay(selected.date)}`
          : 'Nilai tanpa pengumpulan siswa',
      ]}
    />
  )

  return (
    <>
      {hero}
      {!enabled && (
        <Alert type="warning" className="mb-4">
          Fitur Penilaian Langsung belum diaktifkan untuk sekolah ini. Nilai yang sudah ada hanya
          bisa dilihat.
        </Alert>
      )}
      {selectedId ? (
        <ActivityGrid
          activityId={selectedId}
          readOnly={!enabled}
          onSaved={() => activities.reload()}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Daftar penilaian</h2>
            {enabled && (
              <Button onClick={() => setEditing('new')} disabled={!types.data || noTypes}>
                <Plus className="size-4" aria-hidden="true" />
                Penilaian Baru
              </Button>
            )}
          </div>
          {noTypes && (
            <Alert type="warning" className="mb-4">
              Belum ada jenis penilaian. Minta admin membuatnya di Pengaturan Pembelajaran ›
              Penilaian.
            </Alert>
          )}
          {activities.error && <Alert type="error">{activities.error}</Alert>}
          {!activities.data ? (
            <Loading />
          ) : list.length === 0 ? (
            <EmptyState title="Belum ada penilaian">
              Buat penilaian untuk tugas kertas, lisan, praktik di kelas, atau sikap.
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {list.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 sm:p-4"
                >
                  <button
                    type="button"
                    onClick={() => select(item.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                      <ClipboardPen className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-900">
                        {item.title}
                      </span>
                      <span className="block text-sm text-slate-500">
                        {item.grade_type_name} · {formatDay(item.date)} · {item.graded_count}{' '}
                        dinilai
                        {item.absent_count > 0 && ` · ${item.absent_count} tidak hadir`}
                      </span>
                    </span>
                  </button>
                  <Badge color="gray">{SCALE_LABELS[item.scale] ?? item.scale}</Badge>
                  {enabled && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(item)}
                        aria-label={`Ubah ${item.title}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleting(item)}
                        aria-label={`Hapus ${item.title}`}
                      >
                        <Trash2 className="size-4 text-red-600" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {editing && types.data && (
        <ActivityForm
          assignmentId={a.id}
          activity={editing === 'new' ? null : editing}
          types={types.data}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            const isNew = editing === 'new'
            setEditing(null)
            activities.reload()
            if (isNew) select(saved.id) // langsung ke grid nilai
          }}
        />
      )}
      <DeleteDialog
        item={deleting}
        title="Hapus penilaian"
        message={deleting && `Hapus "${deleting.title}" beserta semua nilainya?`}
        onDelete={(item) => gradeActivitiesApi.remove(item.id)}
        onDeleted={() => {
          setDeleting(null)
          activities.reload()
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}

export default function DirectGradingPage() {
  const { id } = useParams()
  const assignment = useFetch(assignmentsApi.get, id)
  if (assignment.error) return <Alert type="error">{assignment.error}</Alert>
  if (!assignment.data) return <Loading />
  return <GradingContent assignment={assignment.data} />
}
