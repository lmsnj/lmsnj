import { useState } from 'react'
import { usersApi } from '../../api/users'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import TextField from '../../components/TextField'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'

export default function ResetPasswordModal({ user, onClose, onDone }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const data = await usersApi.resetPassword(user.id, password)
      onDone(data.detail)
    } catch (err) {
      setError(getFieldErrors(err).new_password ?? getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
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
          required
          autoFocus
        />
      </form>
    </Modal>
  )
}
