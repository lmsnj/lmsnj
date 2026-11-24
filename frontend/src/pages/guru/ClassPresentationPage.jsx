import { FileText, Link2, MonitorPlay, PlayCircle, Sparkles } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { assignmentsApi } from '../../api/academics'
import { materialsApi } from '../../api/materials'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import ClassHero from '../../components/ClassHero'
import EmptyState from '../../components/EmptyState'
import Spinner from '../../components/Spinner'
import useFeature from '../../hooks/useFeature'
import useFetch from '../../hooks/useFetch'
import { ALL } from '../../utils/academic'
import { presentationPath } from '../../utils/presentation'

const TYPE_ICONS = { pdf: FileText, video: PlayCircle, link: Link2, media: Sparkles }

function Loading() {
  return (
    <div className="py-10 text-center text-brand-600">
      <Spinner />
    </div>
  )
}

function MaterialChoices({ assignment }) {
  const materials = useFetch(materialsApi.list, { ...ALL, teaching_assignment: assignment.id })
  if (materials.error) return <Alert type="error">{materials.error}</Alert>
  if (!materials.data) return <Loading />
  const list = materials.data.results
  if (list.length === 0) {
    return (
      <EmptyState title="Belum ada materi">
        Tambahkan materi di tab Materi kelas ini, lalu tampilkan di TV kelas dari sini.
      </EmptyState>
    )
  }
  return (
    <ul className="space-y-2">
      {list.map((material) => {
        const Icon = TYPE_ICONS[material.material_type] ?? FileText
        return (
          <li
            key={material.id}
            className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                {material.title} {!material.is_published && <Badge color="amber">Draf</Badge>}
              </p>
              <p className="text-xs text-slate-500">
                {[
                  material.chapter_title,
                  `${1 + (material.items?.length ?? 0)} konten`,
                  material.objectives?.length ? `${material.objectives.length} capaian` : null,
                ]
                  .filter(Boolean)
                  .join(' • ')}
              </p>
            </div>
            <Link
              to={presentationPath(material)}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <MonitorPlay className="size-4" aria-hidden="true" /> Presentasikan
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** /guru/kelas/:id/presentasi — pilih materi kelas-mapel untuk ditampilkan di TV kelas. */
export default function ClassPresentationPage() {
  const { id } = useParams()
  const enabled = useFeature('presentasi')
  const assignment = useFetch(assignmentsApi.get, id)
  if (assignment.error) return <Alert type="error">{assignment.error}</Alert>
  if (!assignment.data) return <Loading />
  const a = assignment.data

  return (
    <>
      <ClassHero
        back={{ to: `/guru/kelas/${a.id}`, label: a.classroom_name }}
        title="Presentasi Kelas"
        subject={a.subject_name}
        info={[a.classroom_name, 'Tampilkan materi di TV kelas']}
      />
      {enabled ? (
        <>
          <p className="mb-4 text-sm text-slate-600">
            Hubungkan laptop/HP ke TV (kabel HDMI atau screen mirroring), lalu pilih materi. Siswa
            tidak perlu login.
          </p>
          <MaterialChoices assignment={a} />
        </>
      ) : (
        <Alert type="warning">Mode Presentasi Kelas belum diaktifkan untuk sekolah ini.</Alert>
      )}
    </>
  )
}
