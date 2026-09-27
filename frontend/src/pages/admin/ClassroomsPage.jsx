import { useState } from 'react'
import { Link } from 'react-router-dom'
import { classroomsApi } from '../../api/academics'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import DataTable from '../../components/DataTable'
import DeleteDialog from '../../components/DeleteDialog'
import ImportExcelModal from '../../components/ImportExcelModal'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import SelectField from '../../components/SelectField'
import TextField from '../../components/TextField'
import useDebounce from '../../hooks/useDebounce'
import useFetch from '../../hooks/useFetch'
import { GRADES } from '../../utils/academic'
import ClassroomFormModal from './ClassroomFormModal'

const GRADE_FILTERS = [
  { value: '', label: 'Semua tingkat' },
  ...GRADES.map((grade) => ({ value: grade, label: `Kelas ${grade}` })),
]

export default function ClassroomsPage() {
  const [filters, setFilters] = useState({ academic_year: '', grade: '', search: '' })
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState(null)

  const search = useDebounce(filters.search)
  const classrooms = useFetch(classroomsApi.list, { ...filters, search, page })
  const years = useFetch(classroomsApi.academicYears)

  const yearFilters = [
    { value: '', label: 'Semua tahun ajaran' },
    ...(years.data ?? []).map((year) => ({ value: year, label: year })),
  ]

  const handleFilterChange = (event) => {
    setFilters({ ...filters, [event.target.name]: event.target.value })
    setPage(1)
  }

  const closeDialog = () => setDialog(null)

  const columns = [
    {
      header: 'Kelas',
      cell: (c) => (
        <Link to={`/admin/kelas/${c.id}`} className="font-medium text-brand-700 hover:underline">
          {c.name}
        </Link>
      ),
    },
    { header: 'Jurusan', cell: (c) => c.major },
    { header: 'Tahun Ajaran', cell: (c) => c.academic_year },
    {
      header: 'Wali Kelas',
      cell: (c) => c.homeroom_teacher_name ?? <span className="text-slate-400">-</span>,
    },
    { header: 'Siswa', className: 'text-center', cell: (c) => c.student_count },
    {
      header: 'Aksi',
      className: 'text-right whitespace-nowrap',
      cell: (classroom) => (
        <>
          <Button variant="ghost" size="sm" onClick={() => setDialog({ type: 'form', classroom })}>
            Ubah
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50"
            onClick={() => setDialog({ type: 'delete', classroom })}
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
        title="Kelas"
        description="Klik nama kelas untuk mengatur siswa dan mapel di kelas tersebut."
        actions={
          <>
            <Button variant="secondary" onClick={() => setDialog({ type: 'import' })}>
              Impor Excel
            </Button>
            <Button onClick={() => setDialog({ type: 'form', classroom: null })}>
              + Tambah Kelas
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <TextField
          name="search"
          placeholder="Cari nama kelas atau jurusan..."
          value={filters.search}
          onChange={handleFilterChange}
          aria-label="Cari kelas"
        />
        <SelectField
          name="academic_year"
          value={filters.academic_year}
          onChange={handleFilterChange}
          options={yearFilters}
          aria-label="Filter tahun ajaran"
        />
        <SelectField
          name="grade"
          value={filters.grade}
          onChange={handleFilterChange}
          options={GRADE_FILTERS}
          aria-label="Filter tingkat"
        />
      </div>

      <div className="mb-3 space-y-3">
        <Alert type="success">{notice}</Alert>
        <Alert type="error">{classrooms.error}</Alert>
      </div>

      <DataTable
        columns={columns}
        rows={classrooms.data?.results}
        loading={classrooms.loading}
        emptyMessage="Belum ada kelas."
      />
      <div className="mt-4">
        <Pagination page={page} count={classrooms.data?.count ?? 0} onChange={setPage} />
      </div>

      {dialog?.type === 'form' && (
        <ClassroomFormModal
          classroom={dialog.classroom}
          onClose={closeDialog}
          onSaved={(saved, isEdit) => {
            closeDialog()
            setNotice(`Kelas ${saved.name} ${isEdit ? 'diperbarui' : 'ditambahkan'}.`)
            classrooms.reload()
            years.reload()
          }}
        />
      )}
      {dialog?.type === 'import' && (
        <ImportExcelModal
          kind="classrooms"
          title="Impor Kelas dari Excel"
          description="Tambah banyak kelas sekaligus beserta wali kelasnya (username guru)."
          templateName="Template Impor Kelas.xlsx"
          columns={[
            { key: 'name', header: 'Kelas' },
            { key: 'grade', header: 'Tingkat' },
            { key: 'major', header: 'Jurusan' },
            { key: 'academic_year', header: 'Tahun Ajaran' },
            { key: 'homeroom', header: 'Wali Kelas' },
          ]}
          onClose={closeDialog}
          onImported={(count) => {
            closeDialog()
            setNotice(`${count} kelas berhasil diimpor.`)
            classrooms.reload()
            years.reload()
          }}
        />
      )}
      <DeleteDialog
        item={dialog?.type === 'delete' ? dialog.classroom : null}
        title="Hapus Kelas"
        message={(c) =>
          `Hapus kelas ${c.name} (${c.academic_year})? ${c.student_count} siswa di dalamnya akan menjadi "belum punya kelas".`
        }
        onDelete={(c) => classroomsApi.remove(c.id)}
        onDeleted={(c) => {
          closeDialog()
          setNotice(`Kelas ${c.name} dihapus.`)
          classrooms.reload()
          years.reload()
        }}
        onClose={closeDialog}
      />
    </>
  )
}
