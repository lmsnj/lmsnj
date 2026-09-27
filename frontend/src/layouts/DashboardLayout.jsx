import { ChevronDown, Ellipsis, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import SchoolLogo from '../components/brand/SchoolLogo'
import Dropdown, { DropdownItem, SoonBadge } from '../components/Dropdown'
import ErrorBoundary from '../components/ErrorBoundary'
import useAuth from '../hooks/useAuth'
import { ROLE_HOME, SCHOOL } from '../utils/constants'
import { LanguageMenu, NotificationBell, UserMenu } from './HeaderMenus'
import { NAVIGATION } from './navigation'

// Tombol menu di bar hijau. Aktif = latar putih, teks hijau.
function navItemClass(isActive) {
  return `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
    isActive
      ? 'bg-white text-brand-700 shadow-sm'
      : 'text-white/90 hover:bg-white/10 hover:text-white'
  }`
}

function SoonNavItem({ item }) {
  const Icon = item.icon
  return (
    <span
      aria-disabled="true"
      title="Segera hadir"
      className="flex cursor-not-allowed items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-white/50"
    >
      <Icon className="size-4" aria-hidden="true" />
      {item.label}
      <SoonBadge light />
    </span>
  )
}

function NavBar({ nav }) {
  const location = useLocation()
  const moreActive = nav.more.some((item) => item.to && location.pathname.startsWith(item.to))

  return (
    <nav aria-label="Menu utama" className="hidden rounded-xl bg-brand-600 p-1.5 shadow-sm lg:flex">
      <ul className="flex flex-1 flex-wrap items-center gap-1">
        {nav.main.map((item) => (
          <li key={item.label}>
            {item.soon ? (
              <SoonNavItem item={item} />
            ) : (
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) => navItemClass(isActive)}
              >
                <item.icon className="size-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            )}
          </li>
        ))}
        <li className="ml-auto">
          <Dropdown
            label="Menu lainnya"
            buttonClassName={navItemClass(moreActive)}
            button={({ open }) => (
              <>
                <Ellipsis className="size-4" aria-hidden="true" />
                Lainnya
                <ChevronDown
                  className={`size-4 transition ${open ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </>
            )}
          >
            {(close) =>
              nav.more.map((item) => (
                <DropdownItem
                  key={item.label}
                  icon={item.icon}
                  soon={item.soon}
                  as={item.soon ? undefined : Link}
                  to={item.to}
                  onClick={close}
                >
                  {item.label}
                </DropdownItem>
              ))
            }
          </Dropdown>
        </li>
      </ul>
    </nav>
  )
}

// Menu versi HP: panel dari kiri berisi semua item (termasuk "Lainnya").
function MobileMenu({ nav, onClose }) {
  const items = [...nav.main, ...nav.more]
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <nav
        aria-label="Menu utama"
        className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div className="flex items-center gap-2">
            <SchoolLogo className="size-9" />
            <span className="font-bold text-slate-900">{SCHOOL.name}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup menu"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <ul className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => (
            <li key={item.label}>
              {item.soon ? (
                <span
                  aria-disabled="true"
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400"
                >
                  <item.icon className="size-5" aria-hidden="true" />
                  <span className="flex-1">{item.label}</span>
                  <SoonBadge />
                </span>
              ) : (
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      isActive ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`
                  }
                >
                  <item.icon className="size-5" aria-hidden="true" />
                  {item.label}
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

export default function DashboardLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const nav = NAVIGATION[user.role]

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            className="-ml-2 rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Buka menu"
          >
            <Menu className="size-6" aria-hidden="true" />
          </button>
          <Link to={ROLE_HOME[user.role]} className="flex min-w-0 items-center gap-3">
            <SchoolLogo className="size-10 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate font-extrabold text-slate-900 sm:text-lg">
                {SCHOOL.name}
              </span>
              <span className="hidden truncate text-xs text-slate-500 sm:block">
                {SCHOOL.slogan}
              </span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <NotificationBell />
            <LanguageMenu />
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="pt-4">
          <NavBar nav={nav} />
        </div>
        <main className="py-6">
          {/* key: error di satu halaman tidak terbawa saat pindah halaman. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {menuOpen && <MobileMenu nav={nav} onClose={() => setMenuOpen(false)} />}
    </div>
  )
}
