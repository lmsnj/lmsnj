import { useState } from 'react'
import { authApi } from '../api/auth'
import Alert from '../components/Alert'
import Button from '../components/Button'
import PageHeader from '../components/PageHeader'
import TextField from '../components/TextField'
import useAuth from '../hooks/useAuth'
import useScrollToHash from '../hooks/useScrollToHash'
import { ROLE_LABELS, ROLES } from '../utils/constants'
import { getErrorMessage, getFieldErrors } from '../utils/errors'

const EMPTY_FORM = { old_password: '', new_password: '', confirm_password: '' }

export default function ProfilePage() {
  const { user } = useAuth()
  // Menu "Ganti Password" di header membuka /profil#ganti-password.
  useScrollToHash()
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState({ type: '', text: '' })
  const [submitting, setSubmitting] = useState(false)

  const details = [
    ['Nama lengkap', user.full_name],
    ['Username', user.username],
    ['Email', user.email || '-'],
    ['Peran', ROLE_LABELS[user.role]],
    user.role === ROLES.STUDENT && ['NIS', user.nis || '-'],
    user.role === ROLES.TEACHER && ['NIP', user.nip || '-'],
  ].filter(Boolean)

  const handleChange = (event) => setForm({ ...form, [event.target.name]: event.target.value })

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage({ type: '', text: '' })
    if (form.new_password !== form.confirm_password) {
      setErrors({ confirm_password: 'Konfirmasi password tidak sama.' })
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      const data = await authApi.changePassword(form.old_password, form.new_password)
      setMessage({ type: 'success', text: data.detail })
      setForm(EMPTY_FORM)
    } catch (err) {
      setErrors(getFieldErrors(err))
      setMessage({ type: 'error', text: getErrorMessage(err) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader title="Profil Saya" />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 font-semibold text-slate-900">Data Akun</h2>
          <dl className="space-y-3 text-sm">
            {details.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-right font-medium text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-slate-500">
            Perubahan data akun dilakukan oleh admin sekolah.
          </p>
        </section>

        <section
          id="ganti-password"
          className="scroll-mt-24 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
        >
          <h2 className="mb-4 font-semibold text-slate-900">Ganti Password</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Alert type={message.type || 'info'}>{message.text}</Alert>
            <TextField
              label="Password lama"
              name="old_password"
              type="password"
              autoComplete="current-password"
              value={form.old_password}
              onChange={handleChange}
              error={errors.old_password}
              required
            />
            <TextField
              label="Password baru"
              name="new_password"
              type="password"
              autoComplete="new-password"
              value={form.new_password}
              onChange={handleChange}
              error={errors.new_password}
              hint="Minimal 8 karakter, tidak boleh hanya angka."
              required
            />
            <TextField
              label="Ulangi password baru"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              value={form.confirm_password}
              onChange={handleChange}
              error={errors.confirm_password}
              required
            />
            <Button type="submit" loading={submitting}>
              Simpan Password
            </Button>
          </form>
        </section>
      </div>
    </>
  )
}
