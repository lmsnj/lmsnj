import { useState } from 'react'
import { classroomsApi } from '../../api/academics'
import { usersApi } from '../../api/users'
import FormModal from '../../components/FormModal'
import SelectField from '../../components/SelectField'
import TextField from '../../components/TextField'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'
import { ALL, currentAcademicYear, GRADES, toOptions } from '../../utils/academic'
import { ROLES } from '../../utils/constants'

const GRADE_OPTIONS = GRADES.map((grade) => ({ value: grade, label: `Kelas ${grade}` }))

export default function ClassroomFormModal({ classroom, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: classroom?.name ?? '',
    grade: classroom?.grade ?? 'X',
    major: classroom?.major ?? '',
    academic_year: classroom?.academic_year ?? currentAcademicYear(),
    homeroom_teacher: classroom?.homeroom_teacher ? String(classroom.homeroom_teacher) : '',
  })
  const teachers = useFetch(usersApi.list, { ...ALL, role: ROLES.TEACHER, is_active: true })

  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const payload = { ...form, homeroom_teacher: form.homeroom_teacher || null }
    const saved = classroom
      ? await classroomsApi.update(classroom.id, payload)
      : await classroomsApi.create(payload)
    onSaved(saved, Boolean(classroom))
  })

  const handleChange = (event) => setForm({ ...form, [event.target.name]: event.target.value })

  return (
    <FormModal
      title={classroom ? 'Ubah Kelas' : 'Tambah Kelas'}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError}
    >
      <TextField
        label="Nama kelas"
        name="name"
        value={form.name}
        onChange={handleChange}
        error={errors.name}
        placeholder="XI RPL 1"
        required
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="Tingkat"
          name="grade"
          value={form.grade}
          onChange={handleChange}
          options={GRADE_OPTIONS}
          error={errors.grade}
        />
        <TextField
          label="Jurusan"
          name="major"
          value={form.major}
          onChange={handleChange}
          error={errors.major}
          placeholder="RPL"
          required
        />
        <TextField
          label="Tahun ajaran"
          name="academic_year"
          value={form.academic_year}
          onChange={handleChange}
          error={errors.academic_year}
          placeholder="2026/2027"
          required
        />
      </div>
      <SelectField
        label="Wali kelas"
        name="homeroom_teacher"
        value={form.homeroom_teacher}
        onChange={handleChange}
        options={toOptions(teachers.data?.results, (t) => t.full_name, '- Belum ditentukan -')}
        error={errors.homeroom_teacher}
      />
    </FormModal>
  )
}
