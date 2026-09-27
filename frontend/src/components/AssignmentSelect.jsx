import { assignmentsApi } from '../api/academics'
import useFetch from '../hooks/useFetch'
import { ALL, toOptions } from '../utils/academic'
import SelectField from './SelectField'

/**
 * Pilihan kelas-mapel (pengampu) milik user yang login. Backend sudah membatasi datanya:
 * guru hanya melihat yang ia ampu, siswa hanya mapel di kelasnya.
 * `label(a)` mengatur teks pilihan; bawaan "Mapel · Kelas".
 */
export default function AssignmentSelect({
  value,
  onChange,
  placeholder = 'Semua kelas & mapel',
  label,
  optionLabel = (a) => `${a.subject_name} · ${a.classroom_name}`,
  ...props
}) {
  const assignments = useFetch(assignmentsApi.list, ALL)
  return (
    <SelectField
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      options={toOptions(
        assignments.data?.results,
        optionLabel,
        assignments.loading ? 'Memuat...' : placeholder,
      )}
      {...props}
    />
  )
}
