import { useState } from 'react'
import { classroomsApi } from '../../api/academics'
import { usersApi } from '../../api/users'
import AccountList from '../../components/AccountList'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import SelectField from '../../components/SelectField'
import useFetch from '../../hooks/useFetch'
import { ALL } from '../../utils/academic'
import { ROLES } from '../../utils/constants'
import { getErrorMessage } from '../../utils/errors'

// Pilihan "Akun untuk": siswa satu kelas (value = id kelas) atau semua akun satu peran.
const ROLE_TARGETS = [
  { value: `role:${ROLES.TEACHER}`, label: 'Semua guru' },
  { value: `role:${ROLES.ADMIN}`, label: 'Semua admin sekolah' },
]

function targetParams(target) {
  if (target.startsWith('role:')) return { role: target.slice(5) }
  return { classroom: Number(target) }
}

/**
 * Buat kartu akun untuk banyak akun sekaligus (pengguna yang dicentang di halaman Pengguna lewat
 * `users`, atau satu kelas / semua guru), lalu kirim per akun lewat
 * WhatsApp atau cetak semuanya. Password lama tidak bisa ditampilkan (tersimpan sebagai hash), jadi
 * kartu berisi password hanya jika password dibuat ulang.
 */
export default function AccountCardsModal({ users, onClose, onDone }) {
  const picked = users?.length ? users : null // pengguna yang sudah dicentang
  const classrooms = useFetch(classroomsApi.list, ALL)
  const [target, setTarget] = useState('')
  const [resetPassword, setResetPassword] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const classroomOptions = (classrooms.data?.results ?? []).map((c) => ({
    value: String(c.id),
    label: `Siswa ${c.name} (${c.academic_year}) · ${c.student_count} siswa`,
  }))
  const options = [
    { value: '', label: 'Pilih kelas atau peran...' },
    ...classroomOptions,
    ...ROLE_TARGETS,
  ]
  const targetLabel = picked
    ? `${picked.length} pengguna terpilih`
    : (options.find((option) => option.value === target)?.label ?? '')

  const generate = async () => {
    setError('')
    setSubmitting(true)
    try {
      const data = await usersApi.accountCards({
        ...(picked ? { user_ids: picked.map((user) => user.id) } : targetParams(target)),
        reset_password: resetPassword,
      })
      setResult(data.accounts)
      setConfirming(false)
      if (resetPassword) onDone?.(`Password baru dibuat untuk ${data.accounts.length} akun.`)
    } catch (err) {
      setError(getErrorMessage(err))
      setConfirming(false)
    } finally {
      setSubmitting(false)
    }
  }

  // Membuat password baru mengubah akun sungguhan, jadi minta konfirmasi sekali lagi.
  const submit = (event) => {
    event.preventDefault()
    if (resetPassword && !confirming) setConfirming(true)
    else generate()
  }

  if (result) {
    return (
      <Modal
        open
        title="Kartu Akun"
        onClose={onClose}
        size="lg"
        footer={<Button onClick={onClose}>Selesai</Button>}
      >
        <AccountList accounts={result} />
      </Modal>
    )
  }

  return (
    <Modal
      open
      title="Cetak Kartu Akun"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            type="submit"
            form="account-cards-form"
            loading={submitting}
            disabled={!picked && !target}
            variant={confirming ? 'danger' : 'primary'}
          >
            {confirming ? 'Ya, Buat Password Baru' : 'Buat Kartu'}
          </Button>
        </>
      }
    >
      <form id="account-cards-form" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          Kartu berisi alamat masuk, username, dan password. Setiap akun juga bisa dikirim lewat
          WhatsApp.
        </p>
        <Alert type="error">{error}</Alert>
        {picked ? (
          <div className="rounded-xl bg-brand-50 p-3 text-sm ring-1 ring-brand-100">
            <p className="font-medium text-brand-900">{picked.length} pengguna terpilih</p>
            <p className="mt-0.5 line-clamp-2 text-brand-800">
              {picked.map((user) => user.full_name).join(', ')}
            </p>
          </div>
        ) : (
          <SelectField
            label="Akun untuk"
            value={target}
            onChange={(event) => {
              setTarget(event.target.value)
              setConfirming(false)
            }}
            options={options}
            required
          />
        )}
        <label className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
          <input
            type="checkbox"
            checked={resetPassword}
            onChange={(event) => {
              setResetPassword(event.target.checked)
              setConfirming(false)
            }}
            className="mt-0.5 size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
          />
          <span>
            <span className="block font-medium text-slate-900">Buat password baru</span>
            <span className="text-slate-500">
              Password lama tidak bisa ditampilkan karena tersimpan dalam bentuk acak. Jika tidak
              dicentang, kartu hanya berisi alamat dan username.
            </span>
          </span>
        </label>
        {confirming && (
          <Alert type="error">
            Password lama <strong>{targetLabel}</strong> akan diganti dan tidak berlaku lagi.
            Pastikan kartu atau pesan WhatsApp-nya segera dibagikan.
          </Alert>
        )}
      </form>
    </Modal>
  )
}
