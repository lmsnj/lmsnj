import { useState } from 'react'
import { usersApi } from '../../api/users'
import AccountList from '../../components/AccountList'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import TextField from '../../components/TextField'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'

// Reset password satu akun. Kosong = dibuat otomatis. Setelah berhasil, akun + password barunya
// bisa langsung dikirim lewat WhatsApp, disalin, atau dicetak sebagai kartu.
export default function ResetPasswordModal({ user, onClose, onDone }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null) // { detail, account }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const data = await usersApi.resetPassword(user.id, password)
      // Password yang diketik admin tidak dikirim balik server; pakai yang ada di form.
      setResult({
        detail: data.detail,
        account: { ...data.account, password: data.password ?? password },
      })
    } catch (err) {
      setError(getFieldErrors(err).new_password ?? getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <Modal
        open
        title="Password Baru"
        onClose={() => onDone(result.detail)}
        size="lg"
        footer={<Button onClick={() => onDone(result.detail)}>Selesai</Button>}
      >
        <div className="space-y-4">
          <Alert type="success">{result.detail}</Alert>
          <AccountList accounts={[result.account]} />
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      title="Reset Password"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" form="reset-form" loading={submitting}>
            Reset
          </Button>
        </>
      }
    >
      <form id="reset-form" onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-600">
          Atur password baru untuk <strong>{user.full_name}</strong> ({user.username}).
        </p>
        <Alert type="error">{error}</Alert>
        <TextField
          label="Password baru"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint="Kosongkan agar dibuat otomatis. Setelah itu akun bisa dikirim lewat WhatsApp atau dicetak sebagai kartu."
          autoFocus
        />
      </form>
    </Modal>
  )
}
