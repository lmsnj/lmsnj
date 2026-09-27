import { useState } from 'react'
import { classroomsApi } from '../../api/academics'
import { usersApi } from '../../api/users'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import DataTable from '../../components/DataTable'
import DeleteDialog from '../../components/DeleteDialog'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import SelectField from '../../components/SelectField'
import TextField from '../../components/TextField'
import useAuth from '../../hooks/useAuth'
import useDebounce from '../../hooks/useDebounce'
import useFetch from '../../hooks/useFetch'
import { ALL, toOptions } from '../../utils/academic'
import { ROLE_LABELS, ROLES } from '../../utils/constants'
import ResetPasswordModal from './ResetPasswordModal'
import UserFormModal from './UserFormModal'

const ROLE_FILTERS = [
  { value: '', label: 'Semua peran' },
  ...Object.values(ROLES).map((value) => ({ value, label: ROLE_LABELS[value] })),
]

const STATUS_FILTERS = [
  { value: '', label: 'Semua status' },
  { value: 'true', label: 'Aktif' },
  { value: 'false', label: 'Nonaktif' },
]

// Nilai khusus untuk mencari siswa yang belum dimasukkan ke kelas mana pun.
const NO_CLASSROOM = 'none'

const ROLE_COLORS = { [ROLES.ADMIN]: 'amber', [ROLES.TEACHER]: 'blue', [ROLES.STUDENT]: 'gray' }

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const [filters, setFilters] = useState({ role: '', is_active: '', classroom: '', search: '' })
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState('')
  // Modal yang sedang terbuka: { type: 'form' | 'reset' | 'delete', user }
  const [dialog, setDialog] = useState(null)

  const search = useDebounce(filters.search)
  const params = { page, role: filters.role, is_active: filters.is_active, search }
  if (filters.classroom === NO_CLASSROOM) params.classroom__isnull = true
  else if (filters.classroom) params.classroom = filters.classroom

  const users = useFetch(usersApi.list, params)
  const classrooms = useFetch(classroomsApi.list, ALL)

  const classroomFilters = [
    { value: '', label: 'Semua kelas' },
    { value: NO_CLASSROOM, label: 'Belum punya kelas' },
    ...toOptions(classrooms.data?.results, (c) => `${c.name} (${c.academic_year})`),
  ]

  const handleFilterChange = (event) => {
    setFilters({ ...filters, [event.target.name]: event.target.value })
    setPage(1)
  }

  const closeDialog = () => setDialog(null)

  const handleSaved = (saved, isEdit) => {
    closeDialog()
    setNotice(isEdit ? `Data ${saved.full_name} diperbarui.` : `${saved.full_name} ditambahkan.`)
    users.reload()
  }

  const handleDeleted = (user) => {
    closeDialog()
    setNotice(`${user.full_name} dihapus.`)
    // Jika data terakhir di halaman ini terhapus, mundur satu halaman.
    if (users.data?.results.length === 1 && page > 1) setPage(page - 1)
    else users.reload()
  }

  const columns = [
    {
      header: 'Nama',
      cell: (user) => (
        <>
          <p className="font-medium text-slate-900">{user.full_name}</p>
          <p className="text-xs text-slate-500">{user.username}</p>
        </>
      ),
    },
    {
      header: 'Peran',
      cell: (user) => <Badge color={ROLE_COLORS[user.role]}>{ROLE_LABELS[user.role]}</Badge>,
    },
    { header: 'NIS / NIP', cell: (user) => user.nis || user.nip || '-' },
    {
      header: 'Kelas',
      cell: (user) =>
        user.role === ROLES.STUDENT ? (
          (user.classroom_name ?? <span className="text-amber-700">Belum ada</span>)
        ) : (
          <span className="text-slate-400">-</span>
        ),
    },
    {
      header: 'Status',
      cell: (user) => (
        <Badge color={user.is_active ? 'green' : 'red'}>
          {user.is_active ? 'Aktif' : 'Nonaktif'}
        </Badge>
      ),
    },
    {
      header: 'Aksi',
      className: 'text-right whitespace-nowrap',
      cell: (user) => (
        <>
          <Button variant="ghost" size="sm" onClick={() => setDialog({ type: 'form', user })}>
            Ubah
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDialog({ type: 'reset', user })}>
            Reset Password
          </Button>
          {user.id !== currentUser.id && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50"
              onClick={() => setDialog({ type: 'delete', user })}
            >
              Hapus
            </Button>
          )}
        </>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Pengguna"
        description="Kelola akun admin, guru, dan siswa."
        actions={
          <Button onClick={() => setDialog({ type: 'form', user: null })}>+ Tambah Pengguna</Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
        <TextField
          name="search"
          placeholder="Cari nama, username, NIS, atau NIP..."
          value={filters.search}
          onChange={handleFilterChange}
          aria-label="Cari pengguna"
        />
        <SelectField
          name="role"
          value={filters.role}
          onChange={handleFilterChange}
          options={ROLE_FILTERS}
          aria-label="Filter peran"
        />
        <SelectField
          name="classroom"
          value={filters.classroom}
          onChange={handleFilterChange}
          options={classroomFilters}
          aria-label="Filter kelas"
        />
        <SelectField
          name="is_active"
          value={filters.is_active}
          onChange={handleFilterChange}
          options={STATUS_FILTERS}
          aria-label="Filter status"
        />
      </div>

      <div className="mb-3 space-y-3">
        <Alert type="success">{notice}</Alert>
        <Alert type="error">{users.error}</Alert>
      </div>

      <DataTable
        columns={columns}
        rows={users.data?.results}
        loading={users.loading}
        emptyMessage="Belum ada pengguna yang cocok."
      />

      <div className="mt-4">
        <Pagination page={page} count={users.data?.count ?? 0} onChange={setPage} />
      </div>

      {dialog?.type === 'form' && (
        <UserFormModal
          key={dialog.user?.id ?? 'new'}
          user={dialog.user}
          onClose={closeDialog}
          onSaved={handleSaved}
        />
      )}
      {dialog?.type === 'reset' && (
        <ResetPasswordModal
          user={dialog.user}
          onClose={closeDialog}
          onDone={(message) => {
            closeDialog()
            setNotice(message)
          }}
        />
      )}
      <DeleteDialog
        item={dialog?.type === 'delete' ? dialog.user : null}
        title="Hapus Pengguna"
        message={(user) =>
          `Hapus akun ${user.full_name}? Tindakan ini tidak bisa dibatalkan. Untuk sementara melarang login, lebih baik nonaktifkan akun lewat menu Ubah.`
        }
        onDelete={(user) => usersApi.remove(user.id)}
        onDeleted={handleDeleted}
        onClose={closeDialog}
      />
    </>
  )
}
