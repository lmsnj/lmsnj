import { useState } from 'react'
import { assignmentsApi, classroomsApi, subjectsApi } from '../../api/academics'
import { usersApi } from '../../api/users'
import FormModal from '../../components/FormModal'
import SelectField from '../../components/SelectField'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'
import { ALL, toOptions } from '../../utils/academic'
import { ROLES } from '../../utils/constants'

/**
 * Tambah/ubah pengampu. Jika `fixedClassroom` diisi (dari halaman detail kelas),
 * pilihan kelas disembunyikan.
 */
export default function AssignmentFormModal({ assignment, fixedClassroom, onClose, onSaved }) {
  const [form, setForm] = useState({
    teacher: assignment ? String(assignment.teacher) : '',
    subject: assignment ? String(assignment.subject) : '',
    classroom: String(fixedClassroom?.id ?? assignment?.classroom ?? ''),
  })
  const teachers = useFetch(usersApi.list, { ...ALL, role: ROLES.TEACHER, is_active: true })
  const subjects = useFetch(subjectsApi.list, ALL)
  // Daftar kelas tidak perlu dimuat jika kelas sudah ditentukan.
  const classrooms = useFetch(fixedClassroom ? async () => null : classroomsApi.list, ALL)

  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const saved = assignment
      ? await assignmentsApi.update(assignment.id, form)
      : await assignmentsApi.create(form)
    onSaved(saved, Boolean(assignment))
  })

  const handleChange = (event) => setForm({ ...form, [event.target.name]: event.target.value })

  return (
    <FormModal
      title={assignment ? 'Ubah Pengampu' : 'Tambah Pengampu'}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError}
    >
      {fixedClassroom ? (
        <p className="text-sm text-slate-600">
          Kelas: <strong>{fixedClassroom.name}</strong> ({fixedClassroom.academic_year})
        </p>
      ) : (
        <SelectField
          label="Kelas"
          name="classroom"
          value={form.classroom}
          onChange={handleChange}
          options={toOptions(
            classrooms.data?.results,
            (c) => `${c.name} (${c.academic_year})`,
            '- Pilih kelas -',
          )}
          error={errors.classroom}
          required
        />
      )}
      <SelectField
        label="Mata pelajaran"
        name="subject"
        value={form.subject}
        onChange={handleChange}
        options={toOptions(
          subjects.data?.results,
          (s) => `${s.code} - ${s.name}`,
          '- Pilih mapel -',
        )}
        error={errors.subject}
        required
      />
      <SelectField
        label="Guru pengampu"
        name="teacher"
        value={form.teacher}
        onChange={handleChange}
        options={toOptions(teachers.data?.results, (t) => t.full_name, '- Pilih guru -')}
        error={errors.teacher}
        required
      />
    </FormModal>
  )
}
