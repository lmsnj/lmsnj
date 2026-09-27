import { useState } from 'react'
import { subjectsApi } from '../../api/academics'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import DataTable from '../../components/DataTable'
import DeleteDialog from '../../components/DeleteDialog'
import FormModal from '../../components/FormModal'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import TextField from '../../components/TextField'
import useDebounce from '../../hooks/useDebounce'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'

function SubjectFormModal({ subject, onClose, onSaved }) {
  const [form, setForm] = useState({ code: subject?.code ?? '', name: subject?.name ?? '' })
  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const saved = subject
      ? await subjectsApi.update(subject.id, form)
      : await subjectsApi.create(form)
    onSaved(saved, Boolean(subject))
  })
  const handleChange = (event) => setForm({ ...form, [event.target.name]: event.target.value })

  return (
    <FormModal
      title={subject ? 'Ubah Mapel' : 'Tambah Mapel'}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError}
    >
      <TextField
        label="Kode mapel"
        name="code"
        value={form.code}
        onChange={handleChange}
        error={errors.code}
        hint="Singkat dan unik, contoh: PWEB, PBO, BINDO."
        required
      />
      <TextField
        label="Nama mapel"
        name="name"
        value={form.name}
        onChange={handleChange}
        error={errors.name}
        required
      />
    </FormModal>
  )
}

export default function SubjectsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState(null)

  const debouncedSearch = useDebounce(search)
  const subjects = useFetch(subjectsApi.list, { page, search: debouncedSearch })

  const closeDialog = () => setDialog(null)

  const columns = [
    { header: 'Kode', cell: (s) => <span className="font-mono font-medium">{s.code}</span> },
    { header: 'Nama Mapel', cell: (s) => s.name },
    {
      header: 'Aksi',
      className: 'text-right whitespace-nowrap',
      cell: (subject) => (
        <>
          <Button variant="ghost" size="sm" onClick={() => setDialog({ type: 'form', subject })}>
            Ubah
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50"
            onClick={() => setDialog({ type: 'delete', subject })}
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
        title="Mata Pelajaran"
        description="Daftar mapel yang diajarkan di sekolah."
        actions={
          <Button onClick={() => setDialog({ type: 'form', subject: null })}>+ Tambah Mapel</Button>
        }
      />

      <TextField
        className="mb-4 sm:max-w-sm"
        placeholder="Cari kode atau nama mapel..."
        value={search}
        onChange={(event) => {
          setSearch(event.target.value)
          setPage(1)
        }}
        aria-label="Cari mapel"
      />

      <div className="mb-3 space-y-3">
        <Alert type="success">{notice}</Alert>
        <Alert type="error">{subjects.error}</Alert>
      </div>

      <DataTable
        columns={columns}
        rows={subjects.data?.results}
        loading={subjects.loading}
        emptyMessage="Belum ada mapel."
      />
      <div className="mt-4">
        <Pagination page={page} count={subjects.data?.count ?? 0} onChange={setPage} />
      </div>

      {dialog?.type === 'form' && (
        <SubjectFormModal
          subject={dialog.subject}
          onClose={closeDialog}
          onSaved={(saved, isEdit) => {
            closeDialog()
            setNotice(`Mapel ${saved.name} ${isEdit ? 'diperbarui' : 'ditambahkan'}.`)
            subjects.reload()
          }}
        />
      )}
      <DeleteDialog
        item={dialog?.type === 'delete' ? dialog.subject : null}
        title="Hapus Mapel"
        message={(s) => `Hapus mapel ${s.code} - ${s.name}?`}
        onDelete={(s) => subjectsApi.remove(s.id)}
        onDeleted={(s) => {
          closeDialog()
          setNotice(`Mapel ${s.name} dihapus.`)
          subjects.reload()
        }}
        onClose={closeDialog}
      />
    </>
  )
}
