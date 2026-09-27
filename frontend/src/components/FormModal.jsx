import { useId } from 'react'
import Alert from './Alert'
import Button from './Button'
import Modal from './Modal'

// Modal berisi form dengan tombol Batal/Simpan. Tombol Simpan mengirim form lewat atribut `form`.
export default function FormModal({
  title,
  onClose,
  onSubmit,
  submitting,
  error,
  submitLabel = 'Simpan',
  children,
}) {
  const formId = useId()

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" form={formId} loading={submitting}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-4">
        <Alert type="error">{error}</Alert>
        {children}
      </form>
    </Modal>
  )
}
