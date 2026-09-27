import { useEffect, useMemo, useState } from 'react'
import { usersApi } from '../../api/users'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import ConfirmDialog from '../../components/ConfirmDialog'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import SelectField from '../../components/SelectField'
import Spinner from '../../components/Spinner'
import TextField from '../../components/TextField'
import useAuth from '../../hooks/useAuth'
import useDebounce from '../../hooks/useDebounce'
import { ROLE_LABELS, ROLES } from '../../utils/constants'
import { getErrorMessage } from '../../utils/errors'
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

const ROLE_COLORS = { [ROLES.ADMIN]: 'amber', [ROLES.TEACHER]: 'blue', [ROLES.STUDENT]: 'gray' }

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const [filters, setFilters] = useState({ role: '', is_active: '', search: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ count: 0, results: [] })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // Dinaikkan untuk memuat ulang daftar dengan filter yang sama (setelah tambah/ubah/hapus).
  const [reloadCount, setReloadCount] = useState(0)
  const [loadedKey, setLoadedKey] = useState(null)

  // Modal yang sedang terbuka: { type: 'form' | 'reset' | 'delete', user }
  const [dialog, setDialog] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const search = useDebounce(filters.search)
  const params = useMemo(
    () => ({ page, role: filters.role, is_active: filters.is_active, search }),
    [page, filters.role, filters.is_active, search],
  )
  const requestKey = `${JSON.stringify(params)}#${reloadCount}`
  // Sedang memuat selama hasil untuk permintaan terbaru belum diterima.
  const loading = loadedKey !== requestKey

  useEffect(() => {
    // Abaikan respons lama jika filter sudah berubah sebelum respons datang.
    let ignore = false
    usersApi
      .list(params)
      .then((result) => {
        if (ignore) return
        setData(result)
        setError('')
      })
      .catch((err) => !ignore && setError(getErrorMessage(err, 'Gagal memuat data pengguna.')))
      .finally(() => !ignore && setLoadedKey(requestKey))
    return () => {
      ignore = true
    }
  }, [params, requestKey])

  const loadUsers = () => setReloadCount((count) => count + 1)

  const handleFilterChange = (event) => {
    setFilters({ ...filters, [event.target.name]: event.target.value })
    setPage(1)
  }

  const closeDialog = () => setDialog(null)

  const handleSaved = (saved, isEdit) => {
    closeDialog()
    setNotice(isEdit ? `Data ${saved.full_name} diperbarui.` : `${saved.full_name} ditambahkan.`)
    loadUsers()
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await usersApi.remove(dialog.user.id)
      setNotice(`${dialog.user.full_name} dihapus.`)
      closeDialog()
      // Jika data terakhir di halaman ini terhapus, mundur satu halaman.
      if (data.results.length === 1 && page > 1) setPage(page - 1)
      else loadUsers()
    } catch (err) {
      setError(getErrorMessage(err))
      closeDialog()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Pengguna"
        description="Kelola akun admin, guru, dan siswa."
        actions={
          <Button onClick={() => setDialog({ type: 'form', user: null })}>+ Tambah Pengguna</Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
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
          name="is_active"
          value={filters.is_active}
          onChange={handleFilterChange}
          options={STATUS_FILTERS}
          aria-label="Filter status"
        />
      </div>

      <div className="space-y-3">
        <Alert type="success">{notice}</Alert>
        <Alert type="error">{error}</Alert>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Peran</th>
                <th className="px-4 py-3">NIS / NIP</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-brand-600">
                    <Spinner />
                  </td>
                </tr>
              ) : data.results.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Belum ada pengguna yang cocok.
                  </td>
                </tr>
              ) : (
                data.results.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{user.full_name}</p>
                      <p className="text-xs text-slate-500">{user.username}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={ROLE_COLORS[user.role]}>{ROLE_LABELS[user.role]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{user.nis || user.nip || '-'}</td>
                    <td className="px-4 py-3">
                      <Badge color={user.is_active ? 'green' : 'red'}>
                        {user.is_active ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDialog({ type: 'form', user })}
                      >
                        Ubah
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDialog({ type: 'reset', user })}
                      >
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
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4">
        <Pagination page={page} count={data.count} onChange={setPage} />
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
      <ConfirmDialog
        open={dialog?.type === 'delete'}
        title="Hapus Pengguna"
        message={`Hapus akun ${dialog?.user?.full_name}? Tindakan ini tidak bisa dibatalkan. Untuk sementara melarang login, lebih baik nonaktifkan akun lewat menu Ubah.`}
        confirmLabel="Hapus"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={closeDialog}
      />
    </>
  )
}
