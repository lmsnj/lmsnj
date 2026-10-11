import { LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import SchoolLogo from '../components/brand/SchoolLogo'
import { SoonBadge } from '../components/Dropdown'
import useAuth from '../hooks/useAuth'
import useBranding from '../hooks/useBranding'
import { ROLE_HOME } from '../utils/constants'
import { NotificationBell, UserMenu } from './HeaderMenus'
import SchoolSwitcher from './SchoolSwitcher'

/**
 * Tata letak bergaya panel admin: sidebar hijau tua di kiri (semua menu tampil, tanpa "Lainnya"),
 * bar atas putih berisi pilihan sekolah, lonceng, dan menu akun. Dipakai admin yayasan.
 * Di layar < lg sidebar disembunyikan dan dibuka lewat tombol hamburger.
 */

function CountBadge({ count }) {
  if (!count) return null
  return (
    <span
      className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white"
      aria-label={`${count} pesan belum dibaca`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

function SidebarItem({ item, badges, onNavigate }) {
  const Icon = item.icon
  if (item.soon) {
    return (
      <span
        aria-disabled="true"
        title="Segera hadir"
        className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-white/40"
      >
        <Icon className="size-[18px] shrink-0" aria-hidden="true" />
        <span className="flex-1">{item.label}</span>
        <SoonBadge light />
      </span>
    )
  }
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
          isActive
            ? 'bg-brand-600 text-white shadow-sm'
            : 'text-white/85 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      <span className="flex-1">{item.label}</span>
      <CountBadge count={badges[item.badge]} />
    </NavLink>
  )
}

function Sidebar({ nav, badges, onNavigate }) {
  const { user, logout } = useAuth()
  const { branding } = useBranding()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-full flex-col bg-brand-900 text-white">
      <Link
        to={ROLE_HOME[user.role]}
        onClick={onNavigate}
        className="flex items-center gap-3 px-5 py-5"
      >
        <SchoolLogo className="size-11 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-lg leading-tight font-extrabold">
            {branding.school_name}
          </span>
          <span className="block truncate text-xs text-brand-200">{branding.slogan}</span>
        </span>
      </Link>

      <nav aria-label="Menu utama" className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-1">
          {nav.main.map((item) => (
            <li key={item.label}>
              <SidebarItem item={item} badges={badges} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
        {nav.more.length > 0 && (
          <>
            <p className="mt-6 mb-2 px-3 text-xs font-bold tracking-wider text-brand-300 uppercase">
              Lainnya
            </p>
            <ul className="space-y-1">
              {nav.more.map((item) => (
                <li key={item.label}>
                  <SidebarItem item={item} badges={badges} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-white/85 transition hover:bg-white/10 hover:text-white"
        >
          <LogOut className="size-[18px]" aria-hidden="true" />
          Keluar
        </button>
      </div>
    </div>
  )
}

export default function SidebarLayout({ nav, badges, chat, notice, children }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-surface lg:pl-72">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 lg:block">
        <Sidebar nav={nav} badges={badges} />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative h-full w-72 max-w-[85vw] shadow-xl">
            <Sidebar nav={nav} badges={badges} onNavigate={() => setMenuOpen(false)} />
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Tutup menu"
              className="absolute top-3 right-3 rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-8">
          <button
            type="button"
            className="relative -ml-2 rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Buka menu"
          >
            <Menu className="size-6" aria-hidden="true" />
            {badges.chat > 0 && (
              <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-red-500 ring-2 ring-white" />
            )}
          </button>
          <SchoolSwitcher />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <NotificationBell chat={chat} />
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-8">
        {notice}
        <main className="mx-auto max-w-7xl py-6 sm:py-8">{children}</main>
      </div>
    </div>
  )
}
