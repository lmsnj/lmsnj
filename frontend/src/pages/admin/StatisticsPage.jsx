import {
  CalendarDays,
  ChartColumn,
  GraduationCap,
  School,
  Send,
  Star,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react'
import { dashboardApi } from '../../api/dashboard'
import BarList from '../../components/charts/BarList'
import ChartCard from '../../components/charts/ChartCard'
import ColumnChart from '../../components/charts/ColumnChart'
import { DashboardState } from '../../components/Dashboard'
import PageHero from '../../components/PageHero'
import useFetch from '../../hooks/useFetch'
import { formatNumber, shortWeekLabel, statisticsSummary, weekLabel } from '../../utils/statistics'

const percent = (value) => `${formatNumber(value)}%`
const score = (value) => formatNumber(value)

// Statistik Sekolah (admin): grafik siswa per kelas, pengumpulan & kehadiran per minggu, nilai per kelas.
export default function StatisticsPage() {
  const { data, error } = useFetch(dashboardApi.statistics)
  const summary = data && statisticsSummary(data)

  return (
    <div className="space-y-6">
      <PageHero
        title="Statistik Sekolah"
        description="Gambaran sekolah dalam grafik: jumlah siswa, keaktifan, kehadiran, dan nilai."
        icons={[ChartColumn, Users, TrendingUp, CalendarDays, UserCheck, Star, Send]}
        centerIcon={ChartColumn}
        stats={
          summary
            ? [
                { icon: CalendarDays, content: `Tahun ajaran ${data.academic_year ?? '-'}` },
                {
                  icon: GraduationCap,
                  content: `${formatNumber(summary.students)} siswa di kelas`,
                },
                {
                  icon: Send,
                  content: `${formatNumber(summary.submissions)} pengumpulan (8 minggu)`,
                },
                {
                  icon: Star,
                  content: `Rata-rata nilai ${summary.average == null ? '-' : score(summary.average)}`,
                },
              ]
            : []
        }
      />
      <DashboardState loading={!data} error={error}>
        {data && <Charts data={data} />}
      </DashboardState>
    </div>
  )
}

function Charts({ data }) {
  const submissions = data.submissions_by_week.map((row) => ({
    key: row.week_start,
    label: `Minggu ${weekLabel(row.week_start)}`,
    axisLabel: shortWeekLabel(row.week_start),
    value: row.count,
  }))
  const attendance = data.attendance_by_week.map((row) => ({
    key: row.week_start,
    label: `Minggu ${weekLabel(row.week_start)}`,
    axisLabel: shortWeekLabel(row.week_start),
    value: row.rate,
    detail: row.recorded ? `${formatNumber(row.recorded)} catatan presensi` : null,
  }))
  const students = data.students_by_classroom.map((row) => ({
    key: row.id,
    label: row.name,
    value: row.count,
  }))
  const grades = data.grades_by_classroom.map((row) => ({
    key: row.id,
    label: row.name,
    value: row.average,
    detail: `${row.graded} nilai`,
  }))
  const noSubmissions = submissions.every((row) => !row.value)
  const noAttendance = attendance.every((row) => row.value == null)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ChartCard
        title="Pengumpulan Tugas per Minggu"
        description="Jumlah tugas yang dikumpulkan siswa, 8 minggu terakhir (minggu mulai Senin)."
        icon={Send}
        empty={noSubmissions && 'Belum ada pengumpulan tugas dalam 8 minggu terakhir.'}
        table={{
          columns: ['Minggu', 'Pengumpulan'],
          rows: submissions.map((row) => [weekLabel(row.key), formatNumber(row.value)]),
        }}
      >
        <ColumnChart items={submissions} format={formatNumber} label="Pengumpulan per minggu" />
      </ChartCard>

      <ChartCard
        title="Kehadiran per Minggu"
        description="Persentase Hadir dari presensi yang dicatat guru (Sakit & Izin tidak dihitung hadir)."
        icon={UserCheck}
        empty={noAttendance && 'Belum ada presensi yang dicatat dalam 8 minggu terakhir.'}
        table={{
          columns: ['Minggu', 'Hadir', 'Catatan'],
          rows: attendance.map((row, index) => [
            weekLabel(row.key),
            row.value == null ? '–' : percent(row.value),
            formatNumber(data.attendance_by_week[index].recorded),
          ]),
        }}
      >
        <ColumnChart items={attendance} max={100} format={percent} label="Kehadiran per minggu" />
      </ChartCard>

      <ChartCard
        title="Siswa per Kelas"
        description={`Siswa aktif di tiap kelas tahun ajaran ${data.academic_year ?? '-'}.`}
        icon={School}
        empty={students.length === 0 && 'Belum ada kelas di tahun ajaran ini.'}
        table={{
          columns: ['Kelas', 'Siswa'],
          rows: students.map((row) => [row.label, formatNumber(row.value)]),
        }}
      >
        <BarList items={students} format={formatNumber} label="Siswa per kelas" />
      </ChartCard>

      <ChartCard
        title="Rata-rata Nilai Tugas per Kelas"
        description="Skala 100, dari tugas terbit yang sudah dinilai. Tanda – = belum ada nilai."
        icon={Star}
        empty={grades.every((row) => row.value == null) && 'Belum ada tugas yang dinilai.'}
        table={{
          columns: ['Kelas', 'Rata-rata', 'Jumlah nilai'],
          rows: grades.map((row, index) => [
            row.label,
            score(row.value),
            formatNumber(data.grades_by_classroom[index].graded),
          ]),
        }}
      >
        <BarList items={grades} max={100} format={score} label="Rata-rata nilai per kelas" />
      </ChartCard>
    </div>
  )
}
