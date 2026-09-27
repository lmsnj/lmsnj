import { useState } from 'react'
import { classroomsApi } from '../../api/academics'
import { usersApi } from '../../api/users'
import FormModal from '../../components/FormModal'
import SelectField from '../../components/SelectField'
import TextField from '../../components/TextField'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'
import { ALL, toOptions } from '../../utils/academic'
import { ROLE_LABELS, ROLES } from '../../utils/constants'

const ROLE_OPTIONS = Object.values(ROLES).map((value) => ({ value, label: ROLE_LABELS[value] }))

function initialForm(user) {
  return {
    username: user?.username ?? '',
    full_name: user?.full_name ?? '',
    email: user?.email ?? '',
    role: user?.role ?? ROLES.STUDENT,
    nis: user?.nis ?? '',
    nip: user?.nip ?? '',
    classroom: user?.classroom ? String(user.classroom) : '',
    is_active: user?.is_active ?? true,
    password: '',
  }
}

// `user` kosong = tambah pengguna baru; berisi = ubah pengguna tersebut.
// Komponen ini di-mount ulang (lewat `key`) setiap kali dibuka, jadi form selalu segar.
export default function UserFormModal({ user, onClose, onSaved }) {
  const isEdit = Boolean(user)
  const [form, setForm] = useState(() => initialForm(user))
  const classrooms = useFetch(classroomsApi.list, ALL)

  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const payload = { ...form, classroom: form.classroom || null }
    if (isEdit) delete payload.password
    const saved = isEdit ? await usersApi.update(user.id, payload) : await usersApi.create(payload)
    onSaved(saved, isEdit)
  })

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value })
  }

  const classroomOptions = toOptions(
    classrooms.data?.results,
    (c) => `${c.name} (${c.academic_year})`,
    classrooms.loading ? 'Memuat...' : 'Belum ada kelas',
  )

  return (
    <FormModal
      title={isEdit ? 'Ubah Pengguna' : 'Tambah Pengguna'}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError}
    >
      <TextField
        label="Nama lengkap"
        name="full_name"
        value={form.full_name}
        onChange={handleChange}
        error={errors.full_name}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Username"
          name="username"
          value={form.username}
          onChange={handleChange}
          error={errors.username}
          autoComplete="off"
          required
        />
        <SelectField
          label="Peran"
          name="role"
          value={form.role}
          onChange={handleChange}
          options={ROLE_OPTIONS}
          error={errors.role}
        />
      </div>
      <TextField
        label="Email"
        name="email"
        type="email"
        value={form.email}
        onChange={handleChange}
        error={errors.email}
      />
      {form.role === ROLES.STUDENT && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="NIS"
            name="nis"
            value={form.nis}
            onChange={handleChange}
            error={errors.nis}
          />
          <SelectField
            label="Kelas"
            name="classroom"
            value={form.classroom}
            onChange={handleChange}
            options={classroomOptions}
            error={errors.classroom}
          />
        </div>
      )}
      {form.role === ROLES.TEACHER && (
        <TextField
          label="NIP"
          name="nip"
          value={form.nip}
          onChange={handleChange}
          error={errors.nip}
        />
      )}
      {!isEdit && (
        <TextField
          label="Password awal"
          name="password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={handleChange}
          error={errors.password}
          hint="Minimal 8 karakter, tidak boleh hanya angka. Minta pengguna menggantinya setelah login."
          required
        />
      )}
      {isEdit && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="is_active"
            checked={form.is_active}
            onChange={handleChange}
            className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
          />
          Akun aktif (bisa login)
        </label>
      )}
      {errors.is_active && <p className="text-xs text-red-600">{errors.is_active}</p>}
    </FormModal>
  )
}
