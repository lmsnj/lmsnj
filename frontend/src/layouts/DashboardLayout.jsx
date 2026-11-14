import { Suspense } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import ChatToasts from '../components/ChatToasts'
import ErrorBoundary from '../components/ErrorBoundary'
import Spinner from '../components/Spinner'
import useAuth from '../hooks/useAuth'
import useChatNotifications from '../hooks/useChatNotifications'
import { ROLES } from '../utils/constants'
import ImpersonationBanner from './ImpersonationBanner'
import { navigationFor } from './navigation'
import SidebarLayout from './SidebarLayout'

// Akun yang belum terdaftar di sekolah mana pun tidak punya data untuk ditampilkan.
function NoSchoolNotice({ role }) {
  return (
    <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
      {role === ROLES.FOUNDATION ? (
        <>
          Belum ada sekolah aktif.{' '}
          <Link to="/admin/sekolah" className="font-semibold underline">
            Tambahkan sekolah
          </Link>{' '}
          terlebih dahulu.
        </>
      ) : (
        'Akun Anda belum terdaftar di sekolah mana pun. Hubungi admin sekolah.'
      )}
    </div>
  )
}

// Tata letak semua halaman setelah login (Super Admin, admin, guru, siswa): sidebar di kiri
// (di HP menjadi menu ☰) dan bar atas putih. Menu per peran diatur di navigation.js.
export default function DashboardLayout() {
  const { user, school, schools } = useAuth()
  // Super Admin tanpa sekolah terbuka = mode Super Admin (normal), kecuali belum ada sekolah sama sekali.
  const showNoSchool = !school && (user.role !== ROLES.FOUNDATION || schools.length === 0)
  const location = useLocation()
  const nav = navigationFor(user.role, school)
  // Pesan obrolan baru: badge menu, isi lonceng, dan pemberitahuan melayang. Di Ruang Obrolan
  // sendiri pemberitahuan melayang tidak perlu (daftar percakapan sudah terlihat).
  const chat = useChatNotifications({ showToasts: location.pathname !== '/obrolan' })

  // key = user + sekolah aktif: saat pindah sekolah (atau Super Admin masuk ke akun lain) semua
  // isi halaman dipasang ulang sehingga data dimuat ulang (tidak ada data lama yang tertinggal).
  const layoutKey = `${user.id}-${school?.id ?? 'none'}`
  return (
    <div key={layoutKey}>
      <SidebarLayout
        banner={<ImpersonationBanner />}
        nav={nav}
        badges={{ chat: chat.unread }}
        chat={chat.conversations}
        notice={showNoSchool && <NoSchoolNotice role={user.role} />}
      >
        {/* key: error di satu halaman tidak terbawa saat pindah halaman. */}
        <ErrorBoundary key={location.pathname}>
          {/* Sidebar & bar atas tetap tampil selama kode halaman berikutnya diunduh. */}
          <Suspense
            fallback={
              <div className="py-16 text-center text-brand-600">
                <Spinner className="size-8" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </SidebarLayout>
      <ChatToasts toasts={chat.toasts} onDismiss={chat.dismiss} />
    </div>
  )
}
