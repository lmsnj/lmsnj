import { useState } from 'react'
import { classroomsApi } from '../api/academics'
import { reportsApi } from '../api/reports'
import Alert from '../components/Alert'
import { StatCard, StatGrid } from '../components/Dashboard'
import EmptyState from '../components/EmptyState'
import FileDownloadButton from '../components/FileDownloadButton'
import PageHeader from '../components/PageHeader'
import SelectField from '../components/SelectField'
import Spinner from '../components/Spinner'
import useAuth from '../hooks/useAuth'
import useFetch from '../hooks/useFetch'
import { ALL, toOptions } from '../utils/academic'
import { ROLES } from '../utils/constants'
import { formatScore } from '../utils/tasks'

// Warna nilai: merah < 70 (di bawah KKM umum), hijau >= 85.
function scoreClass(value) {
  if (value === null || value === undefined) return 'text-slate-300'
  if (value < 70) return 'font-semibold text-red-600'
  if (value >= 85) return 'font-semibold text-brand-700'
  return 'text-slate-900'
}

function ReportTable({ classroomId }) {
  const report = useFetch(reportsApi.classroom, classroomId)
  if (report.error) return <Alert type="error">{report.error}</Alert>
  if (!report.data) {
    return (
      <div className="py-10 text-center text-brand-600">
        <Spinner />
      </div>
    )
  }
  const { classroom, subjects, rows, class_average } = report.data
  const graded = rows.filter((r) => r.overall !== null)
  const below = graded.filter((r) => r.overall < 70).length

  return (
    <>
      <StatGrid>
        <StatCard label="Rata-rata kelas" value={formatScore(class_average)} tone="brand" />
        <StatCard label="Siswa" value={rows.length} hint={`${graded.length} sudah punya nilai`} />
        <StatCard label="Mata pelajaran" value={subjects.length} />
        <StatCard
          label="Rata-rata < 70"
          value={below}
          tone={below ? 'red' : 'default'}
          hint="perlu perhatian"
        />
      </StatGrid>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Wali kelas: <strong>{classroom.homeroom_teacher_name ?? '-'}</strong> · Nilai = rata-rata
          tugas yang sudah dinilai (skala 100).
        </p>
        <FileDownloadButton
          fetchBlob={() => reportsApi.classroomCsv(classroom.id)}
          filename={`Laporan Nilai ${classroom.name}.csv`}
        >
          Unduh CSV (Excel)
        </FileDownloadButton>
      </div>

      {subjects.length === 0 ? (
        <EmptyState title="Kelas ini belum punya mata pelajaran" />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th className="sticky left-0 bg-slate-50 px-4 py-3 text-left">Nama</th>
                {subjects.map((s) => (
                  <th
                    key={s.id}
                    className="px-3 py-3 text-center"
                    title={`${s.subject_name} — ${s.teacher_name}`}
                  >
                    {s.subject_code}
                    <span className="block font-normal text-slate-400">{s.task_count} tugas</span>
                  </th>
                ))}
                <th className="px-4 py-3 text-center">Rata-rata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.student.id} className="hover:bg-slate-50">
                  <td className="sticky left-0 bg-white px-4 py-2 font-medium whitespace-nowrap text-slate-900">
                    {row.student.full_name}
                    {row.student.nis && (
                      <span className="block text-xs font-normal text-slate-500">
                        NIS {row.student.nis}
                      </span>
                    )}
                  </td>
                  {subjects.map((s) => (
                    <td
                      key={s.id}
                      className={`px-3 py-2 text-center ${scoreClass(row.averages[s.id])}`}
                    >
                      {formatScore(row.averages[s.id])}
                    </td>
                  ))}
                  <td className={`px-4 py-2 text-center ${scoreClass(row.overall)}`}>
                    {formatScore(row.overall)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// Laporan nilai per kelas. Admin: semua kelas. Guru: hanya kelas yang ia walikan.
export default function ReportPage() {
  const { user } = useAuth()
  const isAdmin = user.role === ROLES.ADMIN
  const classrooms = useFetch(
    classroomsApi.list,
    isAdmin ? ALL : { ...ALL, homeroom_teacher: user.id },
  )
  const [chosen, setChosen] = useState('')
  const list = classrooms.data?.results ?? []
  // Guru wali satu kelas langsung melihat kelasnya tanpa perlu memilih.
  const classroomId = chosen || (list.length === 1 ? String(list[0].id) : '')

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Laporan Nilai Kelas' : 'Laporan Kelas Wali'}
        description="Rekap rata-rata nilai tugas setiap siswa per mata pelajaran."
      />
      {classrooms.loading && !classrooms.data ? (
        <div className="py-10 text-center text-brand-600">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <EmptyState title={isAdmin ? 'Belum ada kelas' : 'Anda belum menjadi wali kelas'}>
          {isAdmin ? 'Buat kelas di menu Ruang Kelas.' : 'Laporan ini khusus untuk wali kelas.'}
        </EmptyState>
      ) : (
        <>
          <SelectField
            value={classroomId}
            onChange={(event) => setChosen(event.target.value)}
            options={toOptions(list, (c) => `${c.name} (${c.academic_year})`, '- Pilih kelas -')}
            className="mb-4 sm:max-w-sm"
            aria-label="Pilih kelas"
          />
          {classroomId ? (
            <ReportTable key={classroomId} classroomId={classroomId} />
          ) : (
            <EmptyState title="Pilih kelas untuk melihat laporannya" />
          )}
        </>
      )}
    </>
  )
}
