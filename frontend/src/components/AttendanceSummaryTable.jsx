import { formatRate, rateTone } from '../utils/attendance'
import DataTable from './DataTable'

/**
 * Rekap presensi per siswa (data dari /api/attendance/summary/).
 * Persentase = Hadir / pertemuan yang sudah dicatat; pertemuan yang belum diisi tidak dihitung.
 */
export default function AttendanceSummaryTable({ summary, loading }) {
  const rows = summary?.rows ?? []
  const columns = [
    { header: 'No', className: 'w-12', cell: (row) => rows.indexOf(row) + 1 },
    {
      header: 'Nama',
      cell: (row) => (
        <span className="font-medium whitespace-nowrap text-slate-900">{row.student_name}</span>
      ),
    },
    { header: 'NIS', cell: (row) => row.nis || '-' },
    { header: 'H', className: 'text-right', cell: (row) => row.H },
    { header: 'S', className: 'text-right', cell: (row) => row.S },
    { header: 'I', className: 'text-right', cell: (row) => row.I },
    { header: 'A', className: 'text-right', cell: (row) => row.A },
    {
      header: 'Kehadiran',
      className: 'text-right',
      cell: (row) => (
        <span className={`font-semibold ${rateTone(row.rate)}`}>{formatRate(row.rate)}</span>
      ),
    },
  ]
  return (
    <DataTable
      columns={columns}
      rows={rows}
      loading={loading}
      rowKey={(row) => row.student}
      emptyMessage="Belum ada siswa di kelas ini."
    />
  )
}
