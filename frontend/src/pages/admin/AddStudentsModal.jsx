import { useState } from 'react'
import { classroomsApi } from '../../api/academics'
import { usersApi } from '../../api/users'
import FormModal from '../../components/FormModal'
import Spinner from '../../components/Spinner'
import TextField from '../../components/TextField'
import useDebounce from '../../hooks/useDebounce'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'
import { ROLES } from '../../utils/constants'

export default function AddStudentsModal({ classroom, onClose, onDone }) {
  const [search, setSearch] = useState('')
  const [onlyWithoutClass, setOnlyWithoutClass] = useState(true)
  // Map id -> siswa, supaya pilihan tetap tersimpan walaupun hasil pencarian berubah.
  const [selected, setSelected] = useState({})

  const debouncedSearch = useDebounce(search)
  const params = { role: ROLES.STUDENT, is_active: true, search: debouncedSearch, page_size: 50 }
  if (onlyWithoutClass) params.classroom__isnull = true
  const students = useFetch(usersApi.list, params)

  const candidates = (students.data?.results ?? []).filter((s) => s.classroom !== classroom.id)
  const selectedIds = Object.keys(selected).map(Number)

  const toggle = (student) => {
    setSelected((prev) => {
      const next = { ...prev }
      if (next[student.id]) delete next[student.id]
      else next[student.id] = student
      return next
    })
  }

  const { submit, submitting, generalError, errors } = useFormSubmit(async () => {
    const result = await classroomsApi.addStudents(classroom.id, selectedIds)
    onDone(result.detail)
  })

  return (
    <FormModal
      title={`Tambah Siswa ke ${classroom.name}`}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError || errors.student_ids}
      submitLabel={`Tambahkan (${selectedIds.length})`}
    >
      <TextField
        placeholder="Cari nama, username, atau NIS..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Cari siswa"
      />
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={onlyWithoutClass}
          onChange={(event) => setOnlyWithoutClass(event.target.checked)}
          className="size-4 rounded border-slate-300"
        />
        Hanya siswa yang belum punya kelas
      </label>

      <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg ring-1 ring-slate-200">
        {students.loading && !candidates.length ? (
          <div className="p-6 text-center text-brand-600">
            <Spinner />
          </div>
        ) : candidates.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">Tidak ada siswa yang cocok.</p>
        ) : (
          candidates.map((student) => (
            <label
              key={student.id}
              className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={Boolean(selected[student.id])}
                onChange={() => toggle(student)}
                className="size-4 rounded border-slate-300"
              />
              <span className="flex-1 text-sm">
                <span className="font-medium text-slate-900">{student.full_name}</span>
                <span className="block text-xs text-slate-500">
                  {student.nis ? `NIS ${student.nis}` : student.username}
                </span>
              </span>
              {student.classroom_name && (
                // Peringatan: siswa ini akan dipindah dari kelas lamanya.
                <span className="text-xs text-amber-700">Pindah dari {student.classroom_name}</span>
              )}
            </label>
          ))
        )}
      </div>
      {students.data?.count > candidates.length && (
        <p className="text-xs text-slate-500">
          Menampilkan sebagian hasil. Gunakan pencarian untuk mempersempit.
        </p>
      )}
    </FormModal>
  )
}
