import { CircleCheck, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import MiniColumns from '../../components/charts/MiniColumns'
import { formatDate } from '../../utils/media'
import { formatNumber } from '../../utils/statistics'

// Isi data asli untuk kartu Beranda admin (kunci = `key` kartu di pages/home/cards.js).

function Figures({ items }) {
  return (
    <p className="flex flex-wrap gap-x-5 gap-y-1">
      {items.map((item) => (
        <span key={item.label} className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold text-slate-900 tabular-nums">
            {formatNumber(item.value)}
          </span>
          <span className="text-sm text-slate-600">{item.label}</span>
        </span>
      ))}
    </p>
  )
}

// Baris keterangan: kuning + ikon peringatan jika ada yang perlu dibereskan, hijau jika beres.
function Note({ count, problem, done, to }) {
  if (!count) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-brand-700">
        <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
        {done}
      </p>
    )
  }
  return (
    <Link
      to={to}
      className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:underline"
    >
      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
      {formatNumber(count)} {problem}
    </Link>
  )
}

/** Isi satu kartu (`card` = key kartu) dari data /api/dashboard/ admin. */
export default function AdminCardContent({ data, card }) {
  const { stats, attention, trends, school_announcements: announcements } = data
  const weekly = trends.submissions_by_week.map((row) => row.count)
  const submissions = weekly.reduce((sum, value) => sum + value, 0)

  return {
    users: (
      <>
        <Figures
          items={[
            { label: 'Siswa', value: stats.students },
            { label: 'Guru', value: stats.teachers },
          ]}
        />
        <Note
          count={attention.students_without_classroom}
          problem="siswa belum punya kelas"
          done="Semua siswa sudah punya kelas"
          to="/admin/pengguna"
        />
      </>
    ),
    classes: (
      <>
        <Figures
          items={[
            { label: 'Kelas', value: stats.classrooms },
            { label: 'Mapel', value: stats.subjects },
            { label: 'Pengampu', value: stats.teaching_assignments },
          ]}
        />
        <Note
          count={attention.classrooms_without_homeroom}
          problem="kelas belum punya wali kelas"
          done="Semua kelas sudah punya wali kelas"
          to="/admin/kelas"
        />
      </>
    ),
    reports: (
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <MiniColumns
            values={weekly}
            label={`Pengumpulan tugas 8 minggu terakhir: ${weekly.join(', ')}`}
          />
          <p className="mt-1 text-xs text-slate-600">
            {formatNumber(submissions)} pengumpulan · 8 minggu
          </p>
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {trends.attendance_rate == null ? '–' : `${formatNumber(trends.attendance_rate)}%`}
          </p>
          <p className="text-xs text-slate-600">
            {trends.attendance_rate == null ? 'Presensi belum dicatat' : 'Kehadiran · 8 minggu'}
          </p>
        </div>
      </div>
    ),
    announcements: announcements.latest ? (
      <>
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
          Terbaru · {formatNumber(announcements.count)} pengumuman
        </p>
        <Link
          to="/pengumuman"
          className="mt-0.5 line-clamp-2 font-semibold text-slate-900 hover:underline"
        >
          {announcements.latest.title}
        </Link>
        <p className="text-xs text-slate-500">{formatDate(announcements.latest.created_at)}</p>
      </>
    ) : (
      <p className="text-sm text-slate-600">
        Belum ada pengumuman untuk seluruh sekolah. Sampaikan info pertama Anda.
      </p>
    ),
  }[card]
}
