import { CheckCheck } from 'lucide-react'
import { useState } from 'react'
import { attendanceApi } from '../api/attendance'
import useFetch from '../hooks/useFetch'
import useFormSubmit from '../hooks/useFormSubmit'
import { ATTENDANCE_STATUSES, countSheet, initialSheet } from '../utils/attendance'
import { formatDate } from '../utils/media'
import Alert from './Alert'
import Button from './Button'
import Modal from './Modal'
import Spinner from './Spinner'

// Isi lembar (Hadir/Sakit/Izin/Alpa per siswa). Dipasang setelah data siswa termuat.
function Sheet({ data, onSaved, onClose }) {
  const [sheet, setSheet] = useState(() => initialSheet(data.students))
  const counts = countSheet(sheet)
  const { submit, submitting, generalError, errors } = useFormSubmit(async () => {
    const records = data.students.map((s) => ({ student: s.student, status: sheet[s.student] }))
    onSaved(await attendanceApi.save(data.session, records))
  })
  const setAll = (value) =>
    setSheet(Object.fromEntries(data.students.map((s) => [s.student, value])))

  return (
    <Modal
      open
      size="lg"
      title={`Presensi · ${data.subject_name} ${data.classroom_name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} loading={submitting} disabled={!data.students.length}>
            Simpan Presensi
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {data.title} · {formatDate(data.starts_at)}
          {!data.recorded && ' · belum pernah diisi (semua diawali Hadir)'}
        </p>
        <Alert type="error">{generalError || errors.records || errors.detail}</Alert>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-700">
            {ATTENDANCE_STATUSES.map((s) => `${s.label} ${counts[s.value]}`).join(' · ')}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setAll('H')}>
            <CheckCheck className="size-4" aria-hidden="true" /> Semua Hadir
          </Button>
        </div>
        {data.students.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Belum ada siswa di kelas ini.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
            {data.students.map((s, index) => (
              <li
                key={s.student}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="min-w-0 text-sm">
                  <span className="text-slate-400">{index + 1}.</span>{' '}
                  <span className="font-medium text-slate-900">{s.student_name}</span>
                  {s.nis && <span className="text-slate-500"> · {s.nis}</span>}
                </span>
                <span
                  className="flex gap-1"
                  role="radiogroup"
                  aria-label={`Status ${s.student_name}`}
                >
                  {ATTENDANCE_STATUSES.map((option) => {
                    const selected = sheet[s.student] === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        title={option.label}
                        onClick={() => setSheet({ ...sheet, [s.student]: option.value })}
                        className={`size-9 rounded-lg text-sm font-bold ring-1 transition ${
                          selected
                            ? option.active
                            : 'bg-white text-slate-500 ring-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {option.value}
                      </button>
                    )
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

/** Lembar presensi satu pertemuan. `onSaved(data)` dipanggil setelah tersimpan. */
export default function AttendanceSheetModal({ sessionId, onClose, onSaved }) {
  const { data, error } = useFetch(attendanceApi.session, sessionId)
  if (!data) {
    return (
      <Modal open title="Presensi" onClose={onClose}>
        {error ? (
          <Alert type="error">{error}</Alert>
        ) : (
          <div className="py-10 text-center text-brand-600">
            <Spinner />
          </div>
        )}
      </Modal>
    )
  }
  return <Sheet data={data} onSaved={onSaved} onClose={onClose} />
}
