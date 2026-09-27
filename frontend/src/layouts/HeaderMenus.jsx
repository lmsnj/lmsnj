import { Bell, Check, ChevronDown, KeyRound, Languages, LogOut, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { dashboardApi } from '../api/dashboard'
import Dropdown, { DropdownItem } from '../components/Dropdown'
import useAuth from '../hooks/useAuth'
import useFetch from '../hooks/useFetch'
import { ROLE_LABELS, ROLES } from '../utils/constants'

const iconButton =
  'relative flex items-center gap-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900'

const ADMIN_NOTICES = [
  ['students_without_classroom', 'siswa belum punya kelas', '/admin/pengguna'],
  ['teachers_without_assignment', 'guru belum mengampu mapel', '/admin/pengampu'],
  ['classrooms_without_homeroom', 'kelas belum punya wali kelas', '/admin/kelas'],
]

// Pemberitahuan diambil dari data dashboard yang sudah ada (bukan angka buatan).
function buildNotices(role, data) {
  if (!data) return { count: 0, items: [] }
  if (role === ROLES.TEACHER) {
    return {
      count: data.stats.to_grade,
      items: data.to_grade.map((item) => ({
        key: item.submission_id,
        text: `${item.student_name} mengumpulkan "${item.task_title}"`,
        meta: `${item.classroom_name} · perlu dinilai`,
        to: `/guru/tugas/${item.task_id}`,
      })),
    }
  }
  if (role === ROLES.STUDENT) {
    return {
      count: data.stats.pending,
      items: data.pending_tasks.map((task) => ({
        key: task.id,
        text: `Tugas "${task.title}" belum dikumpulkan`,
        meta: `${task.subject_name}${task.is_past_due ? ' · sudah lewat tenggat' : ''}`,
        to: `/siswa/tugas/${task.id}`,
      })),
    }
  }
  const items = ADMIN_NOTICES.filter(([key]) => data.attention[key] > 0).map(
    ([key, label, to]) => ({
      key,
      text: `${data.attention[key]} ${label}`,
      meta: 'Perlu ditindaklanjuti',
      to,
    }),
  )
  return { count: items.length, items }
}

export function NotificationBell() {
  const { user } = useAuth()
  const dashboard = useFetch(dashboardApi.get)
  const { count, items } = buildNotices(user.role, dashboard.data)

  return (
    <Dropdown
      label={`Pemberitahuan${count ? ` (${count})` : ''}`}
      width="w-80"
      buttonClassName={iconButton}
      onOpen={dashboard.reload}
      button={() => (
        <>
          <Bell className="size-5" aria-hidden="true" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </>
      )}
    >
      {(close) => (
        <>
          <p className="border-b border-slate-100 px-4 py-2 font-semibold text-slate-900">
            Pemberitahuan
          </p>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-slate-500">Tidak ada pemberitahuan baru.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((item) => (
                <li key={item.key}>
                  <Link
                    to={item.to}
                    onClick={close}
                    className="block px-4 py-2.5 hover:bg-slate-50"
                  >
                    <p className="text-slate-800">{item.text}</p>
                    <p className="text-xs text-slate-500">{item.meta}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {count > items.length && (
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              dan {count - items.length} lainnya
            </p>
          )}
        </>
      )}
    </Dropdown>
  )
}

export function LanguageMenu() {
  return (
    <Dropdown
      label="Pilih bahasa"
      width="w-52"
      buttonClassName={iconButton}
      button={() => (
        <>
          <Languages className="size-5" aria-hidden="true" />
          <span className="hidden text-sm font-medium sm:inline">ID</span>
        </>
      )}
    >
      {(close) => (
        <>
          <DropdownItem onClick={close}>
            <span className="flex items-center justify-between">
              Bahasa Indonesia <Check className="size-4 text-brand-600" aria-hidden="true" />
            </span>
          </DropdownItem>
          <DropdownItem soon>English</DropdownItem>
        </>
      )}
    </Dropdown>
  )
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

export function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <Dropdown
      label="Menu pengguna"
      buttonClassName="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-slate-100"
      button={({ open }) => (
        <>
          <span className="flex size-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
            {initials(user.full_name)}
          </span>
          <span className="hidden max-w-40 text-left md:block">
            <span className="block truncate text-sm font-semibold text-slate-900">
              {user.full_name}
            </span>
            <span className="block text-xs text-slate-500">{ROLE_LABELS[user.role]}</span>
          </span>
          <ChevronDown
            className={`hidden size-4 text-slate-400 transition md:block ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </>
      )}
    >
      {(close) => (
        <>
          <div className="border-b border-slate-100 px-4 py-2 md:hidden">
            <p className="truncate font-semibold text-slate-900">{user.full_name}</p>
            <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
          </div>
          <DropdownItem as={Link} to="/profil" icon={UserRound} onClick={close}>
            Profil
          </DropdownItem>
          <DropdownItem as={Link} to="/profil#ganti-password" icon={KeyRound} onClick={close}>
            Ganti Password
          </DropdownItem>
          <div className="my-1 border-t border-slate-100" />
          <DropdownItem icon={LogOut} onClick={handleLogout} className="text-red-600">
            Keluar
          </DropdownItem>
        </>
      )}
    </Dropdown>
  )
}
