import { attendanceApi } from '../../api/attendance'
import Alert from '../../components/Alert'
import { StatCard, StatGrid } from '../../components/Dashboard'
import DataTable from '../../components/DataTable'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import useFetch from '../../hooks/useFetch'
import { formatRate, rateTone } from '../../utils/attendance'

// Kehadiran siswa yang login: keseluruhan dan per mapel.
export default function StudentAttendancePage() {
  const { data, error, loading } = useFetch(attendanceApi.mine)
  const columns = [
    { header: 'Mata pelajaran', cell: (row) => row.subject_name },
    { header: 'Hadir', className: 'text-right', cell: (row) => row.H },
    { header: 'Sakit', className: 'text-right', cell: (row) => row.S },
    { header: 'Izin', className: 'text-right', cell: (row) => row.I },
    { header: 'Alpa', className: 'text-right', cell: (row) => row.A },
    {
      header: 'Kehadiran',
      className: 'text-right',
      cell: (row) => (
        <span className={`font-semibold ${rateTone(row.rate)}`}>{formatRate(row.rate)}</span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Kehadiran Saya"
        description="Rekap presensi dari setiap pertemuan yang sudah dicatat guru."
      />
      <Alert type="error">{error}</Alert>
      {!data && loading ? (
        <div className="py-10 text-center text-brand-600">
          <Spinner />
        </div>
      ) : (
        data && (
          <>
            <StatGrid>
              <StatCard
                label="Kehadiran"
                tone="brand"
                value={formatRate(data.overall.rate)}
                hint="semua mapel"
              />
              <StatCard label="Sakit" tone="blue" value={data.overall.S} />
              <StatCard label="Izin" tone="amber" value={data.overall.I} />
              <StatCard label="Alpa" tone="red" value={data.overall.A} />
            </StatGrid>
            <DataTable
              columns={columns}
              rows={data.subjects}
              rowKey={(row) => row.subject_name}
              emptyMessage="Belum ada presensi yang dicatat."
            />
          </>
        )
      )}
    </>
  )
}
