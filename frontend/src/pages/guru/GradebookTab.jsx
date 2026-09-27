import { Link } from 'react-router-dom'
import { gradesApi } from '../../api/tasks'
import Alert from '../../components/Alert'
import EmptyState from '../../components/EmptyState'
import FileDownloadButton from '../../components/FileDownloadButton'
import Spinner from '../../components/Spinner'
import useFetch from '../../hooks/useFetch'
import { formatScore } from '../../utils/tasks'

function GradeCell({ grade }) {
  if (!grade) return <span className="text-slate-300">–</span>
  if (grade.score === null) {
    return (
      <span className="text-xs text-amber-700" title="Sudah mengumpulkan, belum dinilai">
        belum dinilai
      </span>
    )
  }
  return (
    <span className={grade.is_late ? 'text-amber-700' : 'text-slate-900'}>
      {formatScore(grade.score)}
      {grade.is_late && <sup title="Dikumpulkan terlambat">*</sup>}
    </span>
  )
}

// Tab "Nilai": rekap siswa × tugas untuk satu kelas-mapel.
export default function GradebookTab({ assignment }) {
  const gradebook = useFetch(gradesApi.gradebook, assignment.id)

  if (gradebook.error) return <Alert type="error">{gradebook.error}</Alert>
  if (!gradebook.data) {
    return (
      <div className="py-10 text-center text-brand-600">
        <Spinner />
      </div>
    )
  }

  const { tasks, rows } = gradebook.data
  if (!tasks.length) {
    return (
      <EmptyState title="Belum ada tugas yang diterbitkan">
        Rekap nilai muncul setelah ada tugas yang terbit.
      </EmptyState>
    )
  }

  const filename = `Nilai ${assignment.subject_code} ${assignment.classroom_name}.csv`
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Rata-rata dihitung dalam skala 100 dari tugas yang <strong>sudah dinilai</strong>.
          <span className="text-amber-700"> *</span> = dikumpulkan terlambat.
        </p>
        <FileDownloadButton
          fetchBlob={() => gradesApi.exportCsv(assignment.id)}
          filename={filename}
        >
          Unduh CSV (Excel)
        </FileDownloadButton>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              <th className="sticky left-0 bg-slate-50 px-4 py-3 text-left">Nama</th>
              {tasks.map((task) => (
                <th key={task.id} className="px-3 py-3 text-center font-medium">
                  <Link
                    to={`/guru/tugas/${task.id}`}
                    className="block max-w-32 truncate hover:text-brand-700"
                    title={task.title}
                  >
                    {task.title}
                  </Link>
                  <span className="font-normal text-slate-400">maks {task.max_score}</span>
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
                </td>
                {tasks.map((task) => (
                  <td key={task.id} className="px-3 py-2 text-center">
                    <GradeCell grade={row.grades[task.id]} />
                  </td>
                ))}
                <td className="px-4 py-2 text-center font-semibold text-slate-900">
                  {formatScore(row.average)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
