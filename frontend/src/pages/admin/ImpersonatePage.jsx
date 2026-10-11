import { Building2, Contact, LogIn, School, Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../../api/auth'
import AdminCard, { CardGrid } from '../../components/AdminCard'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import { Avatar } from '../../components/ClassHero'
import EmptyState from '../../components/EmptyState'
import Pagination from '../../components/Pagination'
import Spinner from '../../components/Spinner'
import useAuth from '../../hooks/useAuth'
import useDebounce from '../../hooks/useDebounce'
import useFetch from '../../hooks/useFetch'
import { ROLE_HOME, ROLE_LABELS, ROLES } from '../../utils/constants'
import { getErrorMessage } from '../../utils/errors'

const ROLE_COLORS = { [ROLES.ADMIN]: 'amber', [ROLES.TEACHER]: 'blue', [ROLES.STUDENT]: 'gray' }
const ROLE_OPTIONS = [
  { value: '', label: 'Semua' },
  { value: ROLES.ADMIN, label: 'Admin' },
  { value: ROLES.TEACHER, label: 'Guru' },
  { value: ROLES.STUDENT, label: 'Siswa' },
]
const fieldClass =
  'rounded-lg border-0 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-600 sm:text-sm'

/**
 * Admin yayasan masuk ke akun guru/siswa/admin sekolah mana pun tanpa password, untuk membantu
 * atau memeriksa tampilan mereka. Kembali lewat pita kuning di atas (tanpa login ulang).
 */
export default function ImpersonatePage() {
  const { schools, impersonate } = useAuth()
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ search: '', role: '', schools: '' })
  const [page, setPage] = useState(1)
  const [entering, setEntering] = useState(null)
  const [error, setError] = useState('')

  const search = useDebounce(filters.search)
  const users = useFetch(authApi.impersonationCandidates, {
    page,
    search,
    role: filters.role,
    schools: filters.schools,
  })
  const list = users.data?.results ?? []

  const change = (changes) => {
    setFilters((current) => ({ ...current, ...changes }))
    setPage(1)
  }

  const enter = async (target) => {
    setEntering(target.id)
    setError('')
    try {
      const user = await impersonate(target.id)
      navigate(ROLE_HOME[user.role], { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
      setEntering(null)
    }
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">
          Masuk sebagai Pengguna
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Buka akun admin sekolah, guru, atau siswa tanpa password untuk membantu atau memeriksa
          tampilannya. Selama di akun itu tampil pita kuning dengan tombol untuk kembali ke akun
          Anda. Setiap kali masuk dicatat.
        </p>
      </div>

      <div className="mb-6 grid gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:grid-cols-[1fr_auto_auto]">
        <label className="relative">
          <span className="sr-only">Cari pengguna</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={filters.search}
            onChange={(event) => change({ search: event.target.value })}
            placeholder="Cari nama, username, NIS, atau NIP..."
            className={`${fieldClass} w-full pl-9`}
          />
        </label>
        <label>
          <span className="sr-only">Peran</span>
          <select
            value={filters.role}
            onChange={(event) => change({ role: event.target.value })}
            className={`${fieldClass} w-full`}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value ? option.label : 'Semua peran'}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Sekolah</span>
          <select
            value={filters.schools}
            onChange={(event) => change({ schools: event.target.value })}
            className={`${fieldClass} w-full`}
          >
            <option value="">Semua sekolah</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-3 space-y-3">
        <Alert type="error">{error || users.error}</Alert>
      </div>

      {users.loading && !users.data ? (
        <div className="py-10 text-center text-brand-600">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="Tidak ada akun yang cocok.">
          Coba kata kunci lain atau ubah pilihan peran/sekolah.
        </EmptyState>
      ) : (
        <CardGrid>
          {list.map((user) => (
            <AdminCard
              key={user.id}
              icon={<Avatar name={user.full_name} className="size-12 text-lg" />}
              title={user.full_name}
              subtitle={`@${user.username}`}
              badges={<Badge color={ROLE_COLORS[user.role]}>{ROLE_LABELS[user.role]}</Badge>}
              meta={[
                (user.nis || user.nip) && {
                  icon: Contact,
                  content: user.nis ? `NIS ${user.nis}` : `NIP ${user.nip}`,
                },
                user.classroom_name && { icon: School, content: user.classroom_name },
                user.schools.length > 0 && {
                  icon: Building2,
                  content: user.schools.map((school) => school.name).join(', '),
                },
              ]}
              actions={
                <Button
                  size="sm"
                  onClick={() => enter(user)}
                  loading={entering === user.id}
                  disabled={entering !== null}
                >
                  {entering !== user.id && <LogIn className="size-4" aria-hidden="true" />}
                  Masuk sebagai {user.full_name.split(' ')[0]}
                </Button>
              }
            />
          ))}
        </CardGrid>
      )}

      <div className="mt-6">
        <Pagination page={page} count={users.data?.count ?? 0} onChange={setPage} />
      </div>
    </>
  )
}
