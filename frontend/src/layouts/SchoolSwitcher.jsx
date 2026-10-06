import { ArrowLeftRight, Check, Settings } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import Dropdown, { DropdownItem } from '../components/Dropdown'
import useAuth from '../hooks/useAuth'
import { ROLE_HOME, ROLES } from '../utils/constants'

// Tombol "Ganti sekolah" di header. Hanya tampil jika user boleh membuka lebih dari satu sekolah
// (guru yang mengajar di beberapa sekolah, atau admin yayasan).
export default function SchoolSwitcher() {
  const { user, schools, school, selectSchool } = useAuth()
  const navigate = useNavigate()
  const isFoundation = user.role === ROLES.FOUNDATION
  if (schools.length < 2 && !isFoundation) return null

  const choose = (next, close) => {
    close()
    if (next.id === school?.id) return
    selectSchool(next)
    // Halaman detail (kelas, tugas) milik sekolah lama tidak ada di sekolah baru.
    navigate(ROLE_HOME[user.role])
  }

  return (
    <Dropdown
      label="Ganti sekolah"
      align="left"
      width="w-72"
      buttonClassName="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50"
      button={() => (
        <>
          <ArrowLeftRight className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Ganti Sekolah</span>
        </>
      )}
    >
      {(close) => (
        <>
          <p className="px-4 pt-2 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Buka sekolah
          </p>
          {schools.map((item) => (
            <DropdownItem
              key={item.id}
              onClick={() => choose(item, close)}
              aria-current={item.id === school?.id ? 'true' : undefined}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{item.name}</span>
                  <span className="text-xs text-slate-500">{item.level_display}</span>
                </span>
                {item.id === school?.id && (
                  <Check className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
                )}
              </span>
            </DropdownItem>
          ))}
          {isFoundation && (
            <>
              <div className="my-1 border-t border-slate-100" />
              <DropdownItem as={Link} to="/admin/sekolah" icon={Settings} onClick={close}>
                Kelola daftar sekolah
              </DropdownItem>
            </>
          )}
        </>
      )}
    </Dropdown>
  )
}
