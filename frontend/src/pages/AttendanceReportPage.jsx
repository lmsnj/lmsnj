import { useState } from 'react'
import { classroomsApi } from '../api/academics'
import { attendanceApi } from '../api/attendance'
import Alert from '../components/Alert'
import AttendanceSummaryTable from '../components/AttendanceSummaryTable'
import { StatCard, StatGrid } from '../components/Dashboard'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import SelectField from '../components/SelectField'
import Spinner from '../components/Spinner'
import TextField from '../components/TextField'
import useAuth from '../hooks/useAuth'
import useFetch from '../hooks/useFetch'
import { ALL, toOptions } from '../utils/academic'
import { formatRate } from '../utils/attendance'
import { isAdminRole } from '../utils/constants'

function Summary({ classroomId, dateFrom, dateTo }) {
  const params = { classroom: classroomId }
  if (dateFrom) params.date_from = dateFrom
  if (dateTo) params.date_to = dateTo
  const summary = useFetch(attendanceApi.summary, params)
  const rows = summary.data?.rows ?? []
  const rated = rows.filter((r) => r.rate !== null)
  const average = rated.length
    ? Math.round((rated.reduce((sum, r) => sum + r.rate, 0) / rated.length) * 10) / 10
    : null

  return (
    <>
      <Alert type="error">{summary.error}</Alert>
      {summary.data && (
        <StatGrid>
          <StatCard label="Pertemuan tercatat" value={summary.data.meetings} hint="semua mapel" />
          <StatCard label="Rata-rata kehadiran" tone="brand" value={formatRate(average)} />
          <StatCard
            label="Di bawah 90%"
            tone="amber"
            value={rated.filter((r) => r.rate < 90).length}
            hint="siswa"
          />
          <StatCard
            label="Alpa"
            tone="red"
            value={rows.reduce((sum, r) => sum + r.A, 0)}
            hint="total"
          />
        </StatGrid>
      )}
      <AttendanceSummaryTable summary={summary.data} loading={summary.loading} />
    </>
  )
}

// Rekap presensi per kelas (semua mapel). Admin: semua kelas. Guru: kelas yang ia walikan.
export default function AttendanceReportPage() {
  const { user } = useAuth()
  const isAdmin = isAdminRole(user.role)
  const classrooms = useFetch(
    classroomsApi.list,
    isAdmin ? ALL : { ...ALL, homeroom_teacher: user.id },
  )
  const [chosen, setChosen] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const list = classrooms.data?.results ?? []
  // Wali satu kelas langsung melihat kelasnya tanpa perlu memilih.
  const classroomId = chosen || (list.length === 1 ? String(list[0].id) : '')

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Rekap Presensi' : 'Rekap Presensi Kelas Wali'}
        description="Kehadiran setiap siswa dari semua mapel. Persentase = Hadir dibagi pertemuan yang sudah diisi guru."
      />
      {classrooms.loading && !classrooms.data ? (
        <div className="py-10 text-center text-brand-600">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <EmptyState title={isAdmin ? 'Belum ada kelas' : 'Anda belum menjadi wali kelas'}>
          {isAdmin ? 'Buat kelas di menu Ruang Kelas.' : 'Rekap ini khusus untuk wali kelas.'}
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <SelectField
              label="Kelas"
              value={classroomId}
              onChange={(event) => setChosen(event.target.value)}
              options={toOptions(list, (c) => `${c.name} (${c.academic_year})`, '- Pilih kelas -')}
            />
            <TextField
              label="Dari tanggal"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
            <TextField
              label="Sampai tanggal"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
          {classroomId ? (
            <Summary
              key={`${classroomId}-${dateFrom}-${dateTo}`}
              classroomId={classroomId}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          ) : (
            <EmptyState title="Pilih kelas untuk melihat rekap presensinya" />
          )}
        </>
      )}
    </>
  )
}
