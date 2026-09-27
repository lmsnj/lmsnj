import { useState } from 'react'
import { assignmentsApi, classroomsApi, subjectsApi } from '../../api/academics'
import { usersApi } from '../../api/users'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import DataTable from '../../components/DataTable'
import DeleteDialog from '../../components/DeleteDialog'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import SelectField from '../../components/SelectField'
import useFetch from '../../hooks/useFetch'
import { ALL, toOptions } from '../../utils/academic'
import { ROLES } from '../../utils/constants'
import AssignmentFormModal from './AssignmentFormModal'

export default function AssignmentsPage() {
  const [filters, setFilters] = useState({ classroom: '', subject: '', teacher: '' })
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState(null)

  const assignments = useFetch(assignmentsApi.list, { ...filters, page })
  const classrooms = useFetch(classroomsApi.list, ALL)
  const subjects = useFetch(subjectsApi.list, ALL)
  const teachers = useFetch(usersApi.list, { ...ALL, role: ROLES.TEACHER })

  const handleFilterChange = (event) => {
    setFilters({ ...filters, [event.target.name]: event.target.value })
    setPage(1)
  }

  const closeDialog = () => setDialog(null)
  const handleSaved = (saved, isEdit) => {
    closeDialog()
    setNotice(
      `${saved.subject_name} di ${saved.classroom_name} ${isEdit ? 'diperbarui' : 'ditambahkan'}.`,
    )
    assignments.reload()
  }

  const columns = [
    {
      header: 'Mapel',
      cell: (a) => (
        <>
          <p className="font-medium text-slate-900">{a.subject_name}</p>
          <p className="font-mono text-xs text-slate-500">{a.subject_code}</p>
        </>
      ),
    },
    { header: 'Kelas', cell: (a) => `${a.classroom_name} (${a.academic_year})` },
    { header: 'Guru', cell: (a) => a.teacher_name },
    {
      header: 'Aksi',
      className: 'text-right whitespace-nowrap',
      cell: (assignment) => (
        <>
          <Button variant="ghost" size="sm" onClick={() => setDialog({ type: 'form', assignment })}>
            Ubah
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50"
            onClick={() => setDialog({ type: 'delete', assignment })}
          >
            Hapus
          </Button>
        </>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Pengampu"
        description="Guru yang mengajar suatu mapel di suatu kelas."
        actions={
          <Button onClick={() => setDialog({ type: 'form', assignment: null })}>
            + Tambah Pengampu
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <SelectField
          name="classroom"
          value={filters.classroom}
          onChange={handleFilterChange}
          options={toOptions(
            classrooms.data?.results,
            (c) => `${c.name} (${c.academic_year})`,
            'Semua kelas',
          )}
          aria-label="Filter kelas"
        />
        <SelectField
          name="subject"
          value={filters.subject}
          onChange={handleFilterChange}
          options={toOptions(subjects.data?.results, (s) => s.name, 'Semua mapel')}
          aria-label="Filter mapel"
        />
        <SelectField
          name="teacher"
          value={filters.teacher}
          onChange={handleFilterChange}
          options={toOptions(teachers.data?.results, (t) => t.full_name, 'Semua guru')}
          aria-label="Filter guru"
        />
      </div>

      <div className="mb-3 space-y-3">
        <Alert type="success">{notice}</Alert>
        <Alert type="error">{assignments.error}</Alert>
      </div>

      <DataTable
        columns={columns}
        rows={assignments.data?.results}
        loading={assignments.loading}
        emptyMessage="Belum ada data pengampu."
      />
      <div className="mt-4">
        <Pagination page={page} count={assignments.data?.count ?? 0} onChange={setPage} />
      </div>

      {dialog?.type === 'form' && (
        <AssignmentFormModal
          assignment={dialog.assignment}
          onClose={closeDialog}
          onSaved={handleSaved}
        />
      )}
      <DeleteDialog
        item={dialog?.type === 'delete' ? dialog.assignment : null}
        title="Hapus Pengampu"
        message={(a) =>
          `Hapus ${a.teacher_name} sebagai pengampu ${a.subject_name} di ${a.classroom_name}?`
        }
        onDelete={(a) => assignmentsApi.remove(a.id)}
        onDeleted={() => {
          closeDialog()
          setNotice('Data pengampu dihapus.')
          assignments.reload()
        }}
        onClose={closeDialog}
      />
    </>
  )
}
