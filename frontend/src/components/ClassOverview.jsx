import {
  ArrowRight,
  Check,
  ClipboardList,
  FileText,
  FolderOpen,
  Link2,
  PlayCircle,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { latestMaterials, pickTasks } from '../utils/classOverview'
import { formatDate } from '../utils/media'
import { dueLabel } from '../utils/tasks'
import Badge from './Badge'
import { Avatar } from './ClassHero'
import Spinner from './Spinner'

const TYPE_ICONS = {
  pdf: { icon: FileText, tile: 'bg-red-100 text-red-600' },
  video: { icon: PlayCircle, tile: 'bg-blue-100 text-blue-600' },
  link: { icon: Link2, tile: 'bg-emerald-100 text-emerald-600' },
}

/** Panel abu-abu muda dengan judul, isi di kotak putih. */
export function OverviewPanel({ title, count, action, children }) {
  return (
    <section className="rounded-2xl bg-slate-50 p-2 ring-1 ring-slate-200/70">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          {title}
          {count !== undefined && (
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300">
              {count}
            </span>
          )}
        </h2>
        {action}
      </div>
      <div className="rounded-xl bg-white p-4 shadow-sm">{children}</div>
    </section>
  )
}

function SeeAll({ onClick, children = 'Lihat semua' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
    >
      {children}
      <ArrowRight className="size-4" aria-hidden="true" />
    </button>
  )
}

function PanelEmpty({ icon: Icon, title, children }) {
  return (
    <div className="py-4 text-center">
      <Icon className="mx-auto size-9 text-brand-600" aria-hidden="true" />
      <p className="mt-2 font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{children}</p>
    </div>
  )
}

/**
 * Kartu aksi cepat berikon besar yang "mengintip" dari kanan.
 * `onClick` untuk membuka tab/form, atau `to` untuk pindah halaman.
 */
export function QuickAction({ title, description, icon: Icon, tile, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex min-h-20 items-center overflow-hidden rounded-xl bg-white py-4 pr-24 pl-5 text-left shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
    >
      <span>
        <span className="block font-semibold text-slate-900">{title}</span>
        {description && <span className="block text-sm text-slate-500">{description}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`absolute -right-2 -bottom-3 flex size-20 rotate-[-8deg] items-center justify-center rounded-2xl text-white shadow-md transition group-hover:rotate-0 ${tile}`}
      >
        <Icon className="size-10" />
      </span>
    </button>
  )
}

const PLAN_STEPS = [
  'Bagikan materi untuk dipelajari siswa secara mandiri',
  'Berikan tugas untuk memeriksa pemahaman siswa',
  'Pantau pengumpulan dan beri nilai beserta umpan balik',
]

/**
 * Tab "Ringkasan" halaman kelas.
 * - `materials`, `tasks`: hasil useFetch (list)
 * - `students`: hasil useFetch daftar siswa (opsional, hanya guru)
 * - `people`: daftar orang yang ditampilkan jika `students` kosong (mis. guru untuk siswa)
 * - `actions`: kartu aksi cepat (QuickAction) di atas
 * - `onSelectTab(id)`: pindah ke tab lain ("Lihat semua")
 * - `taskLink(task)`: alamat detail tugas
 * - `forTeacher`: tampilkan jumlah "perlu dinilai" & status draf, dan langkah rencana pembelajaran
 */
export default function ClassOverview({
  materials,
  tasks,
  students,
  people,
  actions,
  onSelectTab,
  taskLink,
  forTeacher,
}) {
  const materialList = materials.data?.results ?? []
  const taskList = tasks.data?.results ?? []
  const loading = (materials.loading && !materials.data) || (tasks.loading && !tasks.data)
  const empty = !loading && materialList.length === 0 && taskList.length === 0
  const shownTasks = pickTasks(taskList)

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {actions && <div className="grid gap-4 sm:grid-cols-2">{actions}</div>}

        <OverviewPanel
          title="Pembelajaran"
          action={
            materialList.length > 0 && (
              <SeeAll onClick={() => onSelectTab('materi')}>Semua materi</SeeAll>
            )
          }
        >
          {loading ? (
            <div className="py-8 text-center text-brand-600">
              <Spinner />
            </div>
          ) : empty || materialList.length === 0 ? (
            <div className="px-2 py-4 sm:px-6">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                <FolderOpen className="size-9" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-xl font-bold text-slate-900 sm:text-2xl">
                {forTeacher ? 'Rencanakan Pembelajaran Kelas Ini' : 'Belum Ada Materi'}
              </h3>
              {forTeacher ? (
                <ul className="mt-4 divide-y divide-dashed divide-slate-200">
                  {PLAN_STEPS.map((step) => (
                    <li key={step} className="flex items-center gap-3 py-3 text-slate-700">
                      <Check className="size-5 shrink-0 text-brand-600" aria-hidden="true" />
                      {step}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-slate-600">
                  Materi dari guru untuk mapel ini akan muncul di sini.
                </p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {latestMaterials(materialList).map((material) => {
                const type = TYPE_ICONS[material.material_type] ?? TYPE_ICONS.link
                const Icon = type.icon
                return (
                  <li key={material.id}>
                    <button
                      type="button"
                      onClick={() => onSelectTab('materi')}
                      className="flex w-full items-center gap-3 py-3 text-left hover:text-brand-700"
                    >
                      <span
                        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${type.tile}`}
                      >
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-900">
                          {material.title}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {formatDate(material.created_at)}
                        </span>
                      </span>
                      {forTeacher && !material.is_published && <Badge color="amber">Draf</Badge>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </OverviewPanel>
      </div>

      <div className="space-y-6">
        <OverviewPanel
          title="Daftar Tugas"
          action={taskList.length > 0 && <SeeAll onClick={() => onSelectTab('tugas')} />}
        >
          {shownTasks.length === 0 ? (
            <PanelEmpty icon={ClipboardList} title="Belum ada Tugas">
              {forTeacher
                ? 'Tugas yang Anda berikan ke siswa akan ditampilkan di sini.'
                : 'Tugas dari guru akan ditampilkan di sini.'}
            </PanelEmpty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {shownTasks.map((task) => (
                <li key={task.id}>
                  <Link to={taskLink(task)} className="block py-2.5 hover:text-brand-700">
                    <span className="block font-medium text-slate-900">{task.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      Tenggat {dueLabel(task.due_at)}
                      {forTeacher && !task.is_published && <Badge color="amber">Draf</Badge>}
                      {forTeacher && task.ungraded_count > 0 && (
                        <Badge color="red">{task.ungraded_count} perlu dinilai</Badge>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </OverviewPanel>

        {students ? (
          <OverviewPanel
            title="Daftar Siswa"
            count={students.data?.length ?? 0}
            action={students.data?.length > 0 && <SeeAll onClick={() => onSelectTab('siswa')} />}
          >
            {!students.data?.length ? (
              <PanelEmpty icon={Users} title="Belum ada Siswa">
                Siswa yang terdaftar di kelas ini akan ditampilkan di sini.
              </PanelEmpty>
            ) : (
              <ul className="space-y-2.5">
                {students.data.slice(0, 6).map((student) => (
                  <li key={student.id} className="flex items-center gap-3">
                    <Avatar name={student.full_name} className="size-8 text-sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {student.full_name}
                      </span>
                      {student.nis && (
                        <span className="block text-xs text-slate-500">NIS {student.nis}</span>
                      )}
                    </span>
                  </li>
                ))}
                {students.data.length > 6 && (
                  <li className="text-xs text-slate-500">
                    dan {students.data.length - 6} siswa lainnya
                  </li>
                )}
              </ul>
            )}
          </OverviewPanel>
        ) : (
          people && (
            <OverviewPanel title="Guru Pengampu">
              <ul className="space-y-2.5">
                {people.map((person) => (
                  <li key={person.name} className="flex items-center gap-3">
                    <Avatar name={person.name} className="size-9 text-sm" />
                    <span>
                      <span className="block text-sm font-medium text-slate-900">
                        {person.name}
                      </span>
                      <span className="block text-xs text-slate-500">{person.role}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </OverviewPanel>
          )
        )}
      </div>
    </div>
  )
}
