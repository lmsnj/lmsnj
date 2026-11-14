import { ArrowLeftRight, Building2, Check, Settings } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { TENANT } from '../api/client'
import Dropdown, { DropdownItem } from '../components/Dropdown'
import useAuth from '../hooks/useAuth'
import useBranding from '../hooks/useBranding'
import { ROLE_HOME, ROLES } from '../utils/constants'

function Option({ title, subtitle, active, icon: Icon, onClick }) {
  return (
    <DropdownItem onClick={onClick} aria-current={active ? 'true' : undefined}>
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="size-4 shrink-0 text-brand-600" aria-hidden="true" />}
          <span className="min-w-0">
            <span className="block truncate font-medium text-slate-900">{title}</span>
            <span className="text-xs text-slate-500">{subtitle}</span>
          </span>
        </span>
        {active && <Check className="size-4 shrink-0 text-brand-600" aria-hidden="true" />}
      </span>
    </DropdownItem>
  )
}

// Tombol "Ganti Sekolah" di header. Tampil untuk user yang boleh membuka lebih dari satu sekolah
// (guru yang mengajar di beberapa sekolah) dan admin yayasan. Admin yayasan juga bisa kembali ke
// mode yayasan (Biro Pendidikan) yang menampilkan ringkasan semua sekolah.
export default function SchoolSwitcher() {
  const { user, schools, school, selectSchool } = useAuth()
  const { app } = useBranding()
  const navigate = useNavigate()
  const isFoundation = user.role === ROLES.FOUNDATION
  // Di subdomain sekolah sekolahnya terkunci; pindah sekolah = buka alamat sekolah lain.
  if (TENANT.mode === 'school') return null
  if (schools.length < 2 && !isFoundation) return null

  const choose = (next, close) => {
    close()
    if ((next?.id ?? null) === (school?.id ?? null)) return
    selectSchool(next)
    // Halaman detail (kelas, tugas) milik sekolah lama tidak ada di sekolah baru.
    navigate(ROLE_HOME[user.role])
  }

  return (
    <Dropdown
      label={school ? 'Ganti sekolah' : 'Pilih sekolah'}
      align="left"
      width="w-72"
      buttonClassName="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50"
      button={() => (
        <>
          <ArrowLeftRight className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{school ? 'Ganti Sekolah' : 'Pilih Sekolah'}</span>
        </>
      )}
    >
      {(close) => (
        <>
          {isFoundation && (
            <>
              <Option
                title={app.school_name}
                subtitle="Ringkasan semua sekolah"
                icon={Building2}
                active={!school}
                onClick={() => choose(null, close)}
              />
              <div className="my-1 border-t border-slate-100" />
            </>
          )}
          <p className="px-4 pt-2 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Buka sekolah
          </p>
          {schools.map((item) => (
            <Option
              key={item.id}
              title={item.name}
              subtitle={item.level_display}
              active={item.id === school?.id}
              onClick={() => choose(item, close)}
            />
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
