import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import { FullPageSpinner } from '../../components/Spinner'
import TextField from '../../components/TextField'
import useAuth from '../../hooks/useAuth'
import { ROLE_HOME } from '../../utils/constants'
import { getErrorMessage } from '../../utils/errors'

export default function LoginPage() {
  const { user, initializing, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ username: '', password: '' })
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-brand-700">LMS SMKNJ</h1>
          <p className="mt-1 text-sm text-slate-500">Masuk ke akun SMKS Nurul Jadid Anda</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Alert type="error">{error}</Alert>
          <TextField
            label="Username"
            name="username"
            autoComplete="username"
            value={form.username}
            onChange={handleChange}
            required
            autoFocus
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={handleChange}
            required
          />
          <Button type="submit" loading={submitting} className="w-full">
            Masuk
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Lupa password? Hubungi admin sekolah.
        </p>
      </div>
    </div>
  )
}
