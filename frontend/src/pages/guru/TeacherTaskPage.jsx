import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { tasksApi } from '../../api/tasks'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import DataTable from '../../components/DataTable'
import DeleteDialog from '../../components/DeleteDialog'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import TaskDetails from '../../components/TaskDetails'
import useFetch from '../../hooks/useFetch'
import { getErrorMessage } from '../../utils/errors'
import { formatDate } from '../../utils/media'
import { formatScore, submissionStatus } from '../../utils/tasks'
import GradeModal from './GradeModal'
import TaskFormModal from './TaskFormModal'

const FILTERS = [
  { id: 'all', label: 'Semua' },
  { id: 'submitted', label: 'Sudah' },
  { id: 'missing', label: 'Belum' },
  { id: 'ungraded', label: 'Belum dinilai' },
]

// Detail satu tugas untuk guru: info tugas, rekap pengumpulan seluruh siswa, dan penilaian.
export default function TeacherTaskPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const task = useFetch(tasksApi.get, id)
  const roster = useFetch(tasksApi.roster, id)
  const [filter, setFilter] = useState('all')
  const [notice, setNotice] = useState({ type: 'success', text: '' })
  // { type: 'edit' | 'delete' | 'grade', row }
  const [dialog, setDialog] = useState(null)

  if (task.error) {
    return (
      <Alert type="error">
        {task.error}{' '}
        <Link to="/guru/kelas" className="font-medium underline">
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
  const rows = roster.data ?? []
  const submitted = rows.filter((row) => row.submission)
  const late = submitted.filter((row) => row.submission.is_late)
  const ungraded = submitted.filter((row) => row.submission.score === null)
  const visibleRows = {
    all: rows,
    submitted,
    missing: rows.filter((row) => !row.submission),
    ungraded,
  }[filter]

  // Siswa berikutnya (setelah `row`) yang sudah mengumpulkan tetapi belum dinilai.
  const nextUngraded = (row) => {
    const after = rows.slice(rows.indexOf(row) + 1)
    return after.find((r) => r.submission && r.submission.score === null) ?? null
  }

  const handleGraded = (row, saved, goNext) => {
    roster.reload()
    const next = goNext ? nextUngraded(row) : null
    if (next) {
      setDialog({ type: 'grade', row: next })
    } else {
      closeDialog()
      setNotice({
        type: 'success',
        text:
          saved.score === null
            ? `Nilai ${row.student.full_name} dihapus.`
            : `Nilai ${row.student.full_name} disimpan: ${formatScore(saved.score)}.`,
      })
    }
  }
  const backTo = `/guru/kelas/${t.teaching_assignment}?tab=tugas`
  const closeDialog = () => setDialog(null)

  const togglePublish = async () => {
    try {
      const saved = await tasksApi.update(t.id, { is_published: !t.is_published })
      setNotice({
        type: 'success',
        text: saved.is_published ? 'Tugas diterbitkan.' : 'Tugas dijadikan draf.',
      })
      task.reload()
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err) })
    }
  }

  const columns = [
    { header: 'No', className: 'w-12', cell: (row) => rows.indexOf(row) + 1 },
    {
      header: 'Nama',
      cell: (row) => (
        <>
          <p className="font-medium text-slate-900">{row.student.full_name}</p>
          {row.student.nis && <p className="text-xs text-slate-500">NIS {row.student.nis}</p>}
        </>
      ),
    },
    {
      header: 'Status',
      cell: (row) => {
        const status = submissionStatus(row.submission)
        return <Badge color={status.color}>{status.label}</Badge>
      },
    },
    {
      header: 'Waktu Kumpul',
      cell: (row) => (row.submission ? formatDate(row.submission.submitted_at) : '-'),
    },
    {
      header: 'Nilai',
      cell: (row) => {
        if (!row.submission) return <span className="text-slate-400">-</span>
        if (row.submission.score === null) return <Badge color="amber">Belum dinilai</Badge>
        return (
          <span className="font-semibold text-slate-900">
            {formatScore(row.submission.score)}
            <span className="font-normal text-slate-500">/{t.max_score}</span>
          </span>
        )
      },
    },
    {
      header: 'Aksi',
      className: 'text-right',
      cell: (row) =>
        row.submission && (
          <Button variant="ghost" size="sm" onClick={() => setDialog({ type: 'grade', row })}>
            {row.submission.score === null ? 'Periksa & Nilai' : 'Ubah Nilai'}
          </Button>
        ),
    },
  ]

  return (
    <>
      <Link to={backTo} className="mb-2 inline-block text-sm text-brand-700 hover:underline">
        ← {t.subject_name} · {t.classroom_name}
      </Link>
      <PageHeader
        title={t.title}
        description={
          <Badge color={t.is_published ? 'green' : 'amber'}>
            {t.is_published ? 'Terbit — terlihat oleh siswa' : 'Draf — belum terlihat oleh siswa'}
          </Badge>
        }
        actions={
          <>
            <Button variant="secondary" onClick={togglePublish}>
              {t.is_published ? 'Jadikan Draf' : 'Terbitkan'}
            </Button>
            <Button variant="secondary" onClick={() => setDialog({ type: 'edit' })}>
              Ubah
            </Button>
            <Button variant="danger" onClick={() => setDialog({ type: 'delete' })}>
              Hapus
            </Button>
          </>
        }
      />

      <Alert type={notice.type} className="mb-4">
        {notice.text}
      </Alert>

      <TaskDetails task={t} />

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">
            Pengumpulan{' '}
            <span className="font-normal text-slate-500">
              ({submitted.length}/{rows.length} sudah, {late.length} terlambat,{' '}
              {submitted.length - ungraded.length} dinilai)
            </span>
          </h2>
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="group">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-md px-3 py-1 text-sm ${
                  filter === f.id ? 'bg-white font-medium shadow-sm' : 'text-slate-600'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <Alert type="error">{roster.error}</Alert>
        <DataTable
          columns={columns}
          rows={visibleRows}
          loading={roster.loading}
          rowKey={(row) => row.student.id}
          emptyMessage="Tidak ada siswa pada filter ini."
        />
      </section>

      {dialog?.type === 'edit' && (
        <TaskFormModal
          task={t}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog()
            setNotice({ type: 'success', text: 'Tugas diperbarui.' })
            task.reload()
          }}
        />
      )}
      {dialog?.type === 'grade' && (
        <GradeModal
          key={dialog.row.submission.id}
          row={dialog.row}
          maxScore={t.max_score}
          nextRow={nextUngraded(dialog.row)}
          onClose={closeDialog}
          onSaved={(saved, goNext) => handleGraded(dialog.row, saved, goNext)}
        />
      )}
      <DeleteDialog
        item={dialog?.type === 'delete' ? t : null}
        title="Hapus Tugas"
        message={(item) => `Hapus tugas "${item.title}"?`}
        onDelete={(item) => tasksApi.remove(item.id)}
        onDeleted={() => navigate(backTo, { replace: true })}
        onClose={closeDialog}
      />
    </>
  )
}
