import { useState } from 'react'
import { getErrorMessage } from '../utils/errors'
import Alert from './Alert'
import Button from './Button'
import Modal from './Modal'

/**
 * Konfirmasi hapus. Dialog terbuka selama `item` berisi data.
 * Error dari server (mis. data masih dipakai) ditampilkan di dalam dialog.
 */
export default function DeleteDialog({ item, title, message, onDelete, onDeleted, onClose }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const close = () => {
    setError('')
    onClose()
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      await onDelete(item)
      onDeleted(item)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal
      open={Boolean(item)}
      title={title}
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Batal
          </Button>
          <Button variant="danger" loading={deleting} onClick={handleDelete}>
            Hapus
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{item && message(item)}</p>
        <Alert type="error">{error}</Alert>
      </div>
    </Modal>
  )
}
