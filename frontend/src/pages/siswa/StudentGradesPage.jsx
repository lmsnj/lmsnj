import { Link } from 'react-router-dom'
import { tasksApi } from '../../api/tasks'
import Alert from '../../components/Alert'
import { StatCard, StatGrid } from '../../components/Dashboard'
import DataTable from '../../components/DataTable'
import PageHeader from '../../components/PageHeader'
import useFetch from '../../hooks/useFetch'
import { ALL } from '../../utils/academic'
import { formatDate } from '../../utils/media'
import { formatScore } from '../../utils/tasks'

// Rata-rata skala 100 (nilai / nilai maksimal x 100), sama dengan rekap nilai guru.
function average(tasks) {
  if (!tasks.length) return null
  const total = tasks.reduce((sum, t) => sum + (t.my_submission.score / t.max_score) * 100, 0)
  return Math.round((total / tasks.length) * 100) / 100
}

// "Nilai & Progres": semua nilai siswa, rata-rata keseluruhan dan per mapel.
export default function StudentGradesPage() {
  const tasks = useFetch(tasksApi.list, ALL)
  const all = tasks.data?.results ?? []
  const graded = all
    .filter((t) => t.my_submission?.score != null)
    .sort((a, b) => new Date(b.my_submission.graded_at) - new Date(a.my_submission.graded_at))
  const submitted = all.filter((t) => t.my_submission).length

  const bySubject = Object.values(
    graded.reduce((groups, task) => {
      const key = task.teaching_assignment
      groups[key] ??= { id: key, subject: task.subject_name, tasks: [] }
      groups[key].tasks.push(task)
      return groups
    }, {}),
  ).sort((a, b) => a.subject.localeCompare(b.subject))

  const columns = [
    {
      header: 'Tugas',
      cell: (t) => (
        <Link to={`/siswa/tugas/${t.id}`} className="font-medium text-brand-700 hover:underline">
          {t.title}
        </Link>
      ),
    },
    { header: 'Mapel', cell: (t) => t.subject_name },
    {
      header: 'Nilai',
      className: 'text-right',
      cell: (t) => (
        <span className="font-semibold text-slate-900">
          {formatScore(t.my_submission.score)}
          <span className="font-normal text-slate-500">/{t.max_score}</span>
        </span>
      ),
    },
    {
      header: 'Umpan Balik',
      cell: (t) =>
        t.my_submission.feedback ? (
          <span className="line-clamp-2 max-w-xs text-slate-600">{t.my_submission.feedback}</span>
        ) : (
          <span className="text-slate-400">-</span>
        ),
    },
    { header: 'Dinilai', cell: (t) => formatDate(t.my_submission.graded_at) },
  ]

  return (
    <>
      <PageHeader title="Nilai & Progres" description="Nilai dan umpan balik dari guru." />
      <Alert type="error">{tasks.error}</Alert>

      <StatGrid>
        <StatCard
          label="Rata-rata nilai"
          value={formatScore(average(graded))}
          tone="brand"
          hint="skala 100, dari tugas yang sudah dinilai"
        />
        <StatCard label="Tugas dinilai" value={graded.length} />
        <StatCard label="Sudah dikumpulkan" value={submitted} />
        <StatCard label="Total tugas" value={all.length} />
      </StatGrid>

      {bySubject.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 font-semibold text-slate-900">Rata-rata per mata pelajaran</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bySubject.map((group) => {
              const value = average(group.tasks)
              return (
                <div
                  key={group.id}
                  className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-medium text-slate-900">{group.subject}</p>
                    <p className="text-xl font-bold text-brand-700">{formatScore(value)}</p>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${value}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{group.tasks.length} tugas dinilai</p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <h2 className="mb-3 font-semibold text-slate-900">Riwayat nilai</h2>
      <DataTable
        columns={columns}
        rows={graded}
        loading={tasks.loading}
        emptyMessage="Belum ada tugas yang dinilai."
      />
    </>
  )
}
