import {
  BookOpen,
  ClipboardCheck,
  ClipboardPen,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Lightbulb,
  LockKeyhole,
  MessagesSquare,
  Trophy,
  UserRound,
} from 'lucide-react'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import Alert from '../../components/Alert'
import SchoolLogo from '../../components/brand/SchoolLogo'
import Button from '../../components/Button'
import { FullPageSpinner } from '../../components/Spinner'
import useAuth from '../../hooks/useAuth'
import useBranding from '../../hooks/useBranding'
import { ROLE_HOME } from '../../utils/constants'
import { getErrorMessage } from '../../utils/errors'

const FEATURES = [
  { icon: BookOpen, title: 'Materi Pembelajaran', text: 'Modul, video, dan tautan dari guru' },
  { icon: ClipboardCheck, title: 'Tugas & Nilai', text: 'Kumpulkan tugas dan lihat umpan balik' },
  { icon: ClipboardPen, title: 'Lembar Asesmen', text: 'Ujian online bergaya simulasi TKA' },
  { icon: MessagesSquare, title: 'Ruang Obrolan', text: 'Tanya langsung ke guru dan wali kelas' },
]

// Hiasan panel kiri: ikon lucide dalam kotak berwarna (bukan gambar dari produk lain).
const DECORATIONS = [
  { icon: Lightbulb, className: 'top-10 right-10 rotate-12 bg-amber-400' },
  { icon: Trophy, className: 'bottom-28 right-16 -rotate-6 bg-orange-400' },
  { icon: GraduationCap, className: 'top-1/2 right-4 rotate-6 bg-sky-500' },
]

function InputWithIcon({ icon: Icon, label, id, trailing, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-xl bg-white px-3 ring-1 ring-slate-300 transition focus-within:ring-2 focus-within:ring-brand-600">
        <Icon className="size-5 shrink-0 text-slate-400" aria-hidden="true" />
        <input
          id={id}
          className="min-w-0 flex-1 border-0 bg-transparent py-3 text-base text-slate-900 placeholder:text-slate-400 focus:ring-0 focus:outline-none sm:text-sm"
          {...props}
        />
        {trailing}
      </div>
    </div>
  )
}

export default function LoginPage() {
  const { user, initializing, login } = useAuth()
  const { branding } = useBranding()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ username: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (initializing) return <FullPageSpinner />
  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />

  const handleChange = (event) => setForm({ ...form, [event.target.name]: event.target.value })

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const loggedIn = await login(form.username.trim(), form.password)
      // Kembali ke halaman yang tadi dituju, jika ada.
      const from = location.state?.from?.pathname
      navigate(from ?? ROLE_HOME[loggedIn.role], { replace: true })
    } catch (err) {
      const status = err.response?.status
      if (status === 401) setError('Username atau password salah, atau akun Anda tidak aktif.')
      else if (status === 429)
        setError('Terlalu banyak percobaan login. Tunggu sebentar lalu coba lagi.')
      else setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Panel kiri (layar lebar) / pita atas (HP): identitas sekolah */}
      <aside className="relative overflow-hidden bg-brand-600 text-white">
        <div
          className="absolute -top-24 -right-24 size-80 rounded-full bg-amber-400/90"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-32 -left-20 size-96 rounded-full bg-brand-500"
          aria-hidden="true"
        />
        <div className="hidden lg:block" aria-hidden="true">
          {DECORATIONS.map(({ icon: Icon, className }, index) => (
            <span
              key={index}
              className={`absolute flex size-16 items-center justify-center rounded-2xl text-white shadow-lg ring-4 ring-white/30 ${className}`}
            >
              <Icon className="size-8" />
            </span>
          ))}
        </div>

        <div className="relative flex h-full flex-col px-6 py-8 sm:px-10 lg:px-14 lg:py-12">
          <div className="flex items-center gap-3">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white p-1.5 shadow-lg">
              <SchoolLogo className="size-11" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-extrabold sm:text-xl">
                {branding.school_name}
              </span>
              {branding.slogan && (
                <span className="block truncate text-sm text-brand-50">{branding.slogan}</span>
              )}
            </span>
          </div>

          <div className="mt-10 hidden max-w-lg lg:mt-auto lg:block">
            <h1 className="text-4xl leading-tight font-extrabold">
              Belajar lebih mudah, <span className="text-amber-300">kapan saja</span> dan di mana
              saja.
            </h1>
            <p className="mt-3 text-brand-50">
              {branding.app_name}: satu tempat untuk materi, tugas, penilaian, dan komunikasi antara
              guru dan siswa.
            </p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li
                  key={title}
                  className="flex items-start gap-3 rounded-xl bg-white/10 p-3 ring-1 ring-white/20 backdrop-blur-sm"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="block text-xs text-brand-50">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-10 hidden text-xs text-brand-100 lg:mt-auto lg:block">
            © {new Date().getFullYear()} {branding.school_name}
          </p>
        </div>
      </aside>

      {/* Formulir masuk */}
      <main className="flex items-start justify-center px-4 py-8 sm:py-12 lg:items-center">
        <div className="-mt-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200 sm:p-8 lg:mt-0 lg:shadow-sm">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
            <KeyRound className="size-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-2xl font-extrabold text-slate-900">Selamat datang 👋</h2>
          <p className="mt-1 text-sm text-slate-500">
            Masuk ke <strong className="text-slate-700">{branding.app_name}</strong> dengan akun
            dari sekolah.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Alert type="error">{error}</Alert>
            <InputWithIcon
              icon={UserRound}
              label="Username"
              id="username"
              name="username"
              autoComplete="username"
              placeholder="Username atau NIS"
              value={form.username}
              onChange={handleChange}
              required
              autoFocus
            />
            <InputWithIcon
              icon={LockKeyhole}
              label="Password"
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Password"
              value={form.password}
              onChange={handleChange}
              required
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <EyeOff className="size-5" aria-hidden="true" />
                  ) : (
                    <Eye className="size-5" aria-hidden="true" />
                  )}
                </button>
              }
            />
            <Button type="submit" loading={submitting} className="w-full">
              Masuk
            </Button>
          </form>

          <p className="mt-6 rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500 ring-1 ring-slate-100">
            Lupa password? Hubungi <strong className="text-slate-700">admin sekolah</strong> untuk
            mengatur ulang.
          </p>
        </div>
      </main>
    </div>
  )
}
