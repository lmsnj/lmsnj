import {
  BookOpenCheck,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  GraduationCap,
  Library,
  Pencil,
  Plus,
  School,
  Sprout,
  Trash2,
  TreePine,
  Trees,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { assignmentsApi, classroomsApi, subjectsApi } from '../../api/academics'
import { usersApi } from '../../api/users'
import AdminCard, { CardGrid } from '../../components/AdminCard'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import { Avatar } from '../../components/ClassHero'
import DeleteDialog from '../../components/DeleteDialog'
import EmptyState from '../../components/EmptyState'
import { FilterChips, OptionPanel, SubjectPanel } from '../../components/ExplorePanels'
import ImportExcelModal from '../../components/ImportExcelModal'
import PageHero, { HeroButton } from '../../components/PageHero'
import SelectField from '../../components/SelectField'
import Spinner from '../../components/Spinner'
import SubjectIcon from '../../components/SubjectIcon'
import useFetch from '../../hooks/useFetch'
import { ALL, toOptions } from '../../utils/academic'
import { countWith, filterAssignments } from '../../utils/adminFilters'
import { ROLES } from '../../utils/constants'
import { subjectStyle } from '../../utils/subjectStyles'
import AssignmentFormModal from './AssignmentFormModal'

const EMPTY = { search: '', subject: '', grade: '', teacher: '' }
const GRADE_OPTIONS = [
  { id: 'X', title: 'Kelas X', description: 'Pengampu di tingkat pertama', icon: Sprout, tile: 'bg-brand-100 text-brand-700' },
  { id: 'XI', title: 'Kelas XI', description: 'Pengampu di tingkat kedua', icon: TreePine, tile: 'bg-blue-100 text-blue-600' },
  { id: 'XII', title: 'Kelas XII', description: 'Pengampu di tingkat akhir', icon: Trees, tile: 'bg-amber-100 text-amber-700' },
] // prettier-ignore
const HERO_ICONS = [
  GraduationCap,
  Library,
  School,
  Users,
  CalendarDays,
  ClipboardList,
  BookOpenCheck,
]

export default function AssignmentsPage() {
  const [filters, setFilters] = useState(EMPTY)
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState(null)

  const assignments = useFetch(assignmentsApi.list, ALL)
  const classrooms = useFetch(classroomsApi.list, ALL)
  const subjects = useFetch(subjectsApi.list, ALL)
  const teachers = useFetch(usersApi.list, { ...ALL, role: ROLES.TEACHER })

  const all = assignments.data?.results ?? []
  const gradeById = Object.fromEntries((classrooms.data?.results ?? []).map((c) => [c.id, c.grade]))
  const gradeOf = (classroomId) => gradeById[classroomId]
  const shown = filterAssignments(all, filters, gradeOf)
  const subjectItems = (subjects.data?.results ?? []).map((s) => ({ ...s, subject_name: s.name }))
  const teacherCount = new Set(all.map((a) => a.teacher)).size

  const set = (changes) => setFilters((current) => ({ ...current, ...changes }))
  const closeDialog = () => setDialog(null)
  const done = (message) => {
    closeDialog()
    setNotice(message)
    assignments.reload()
  }
  const subject = subjectItems.find((s) => String(s.id) === String(filters.subject))
  const teacher = teachers.data?.results.find((t) => String(t.id) === String(filters.teacher))
  const chips = [
    subject && { key: 'subject', label: subject.name },
    filters.grade && { key: 'grade', label: `Kelas ${filters.grade}` },
    teacher && { key: 'teacher', label: teacher.full_name },
    filters.search.trim() && { key: 'search', label: `“${filters.search.trim()}”` },
  ].filter(Boolean)

  return (
    <>
      <div className="space-y-6">
        <PageHero
          title="Pengampu"
          description="Tetapkan guru yang mengajar suatu mapel di suatu kelas. Materi, tugas, dan asesmen menempel ke pengampu ini."
          icons={HERO_ICONS}
          centerIcon={GraduationCap}
          search={{
            value: filters.search,
            onChange: (search) => set({ search }),
            onSubmit: () =>
              document.getElementById('daftar-hasil')?.scrollIntoView({ behavior: 'smooth' }),
            placeholder: 'Cari mapel, kelas, atau nama guru...',
          }}
          actions={
            <>
              <HeroButton icon={Plus} onClick={() => setDialog({ type: 'form', assignment: null })}>
                Tambah Pengampu
              </HeroButton>
              <HeroButton icon={FileSpreadsheet} onClick={() => setDialog({ type: 'import' })}>
                Impor Excel
              </HeroButton>
            </>
          }
          stats={[
            {
              icon: ClipboardList,
              content: (
                <>
                  <strong className="text-white">{all.length} pengampu</strong> kelas-mapel
                </>
              ),
            },
            {
              icon: Users,
              content: (
                <>
                  oleh <strong className="text-white">{teacherCount} guru</strong>
                </>
              ),
            },
          ]}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <SubjectPanel
            assignments={subjectItems}
            counts={countWith(all, (a) => a.subject)}
            unit="kelas"
            selected={filters.subject}
            onSelect={(id) => set({ subject: id })}
            label={(s) => s.name}
            sublabel={(s) => s.code}
          />
          <OptionPanel
            title="Tingkat Kelas"
            options={GRADE_OPTIONS}
            counts={countWith(all, (a) => gradeOf(a.classroom))}
            selected={filters.grade}
            onSelect={(grade) => set({ grade })}
            resetLabel="Semua"
          />
        </div>
      </div>

      <section id="daftar-hasil" className="mt-8 scroll-mt-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <FilterChips
            className=""
            count={shown.length}
            chips={chips}
            onRemove={(key) => set({ [key]: '' })}
            onClear={() => setFilters(EMPTY)}
          />
          <SelectField
            value={filters.teacher}
            onChange={(event) => set({ teacher: event.target.value })}
            options={toOptions(teachers.data?.results, (t) => t.full_name, 'Semua guru')}
            aria-label="Saring berdasarkan guru"
            className="w-full sm:w-64"
          />
        </div>
        <div className="mb-3 space-y-3">
          <Alert type="success">{notice}</Alert>
          <Alert type="error">{assignments.error}</Alert>
        </div>

        {assignments.loading && !assignments.data ? (
          <div className="py-10 text-center text-brand-600">
            <Spinner />
          </div>
        ) : shown.length === 0 ? (
          <EmptyState
            title={all.length ? 'Tidak ada pengampu yang cocok.' : 'Belum ada data pengampu.'}
          >
            {all.length
              ? 'Coba kata kunci lain atau hapus penyaring.'
              : 'Klik “Tambah Pengampu” atau impor dari Excel.'}
          </EmptyState>
        ) : (
          <CardGrid>
            {shown.map((assignment) => (
              <AdminCard
                key={assignment.id}
                tone={subjectStyle(assignment.subject_name).soft}
                icon={<SubjectIcon name={assignment.subject_name} size="md" />}
                title={assignment.subject_name}
                subtitle={assignment.subject_code}
                meta={[
                  {
                    icon: School,
                    content: (
                      <>
                        <strong className="text-slate-800">{assignment.classroom_name}</strong> ·
                        Tahun Ajaran {assignment.academic_year}
                      </>
                    ),
                  },
                  {
                    icon: GraduationCap,
                    content: (
                      <span className="inline-flex items-center gap-2">
                        <Avatar name={assignment.teacher_name} className="size-6 text-[10px]" />
                        {assignment.teacher_name}
                      </span>
                    ),
                  },
                  { icon: Users, content: `${assignment.student_count} siswa` },
                ]}
                actions={
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialog({ type: 'form', assignment })}
                    >
                      <Pencil className="size-4" aria-hidden="true" /> Ubah
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => setDialog({ type: 'delete', assignment })}
                    >
                      <Trash2 className="size-4" aria-hidden="true" /> Hapus
                    </Button>
                  </>
                }
              />
            ))}
          </CardGrid>
        )}
      </section>

      {dialog?.type === 'form' && (
        <AssignmentFormModal
          assignment={dialog.assignment}
          onClose={closeDialog}
          onSaved={(saved, isEdit) =>
            done(
              `${saved.subject_name} di ${saved.classroom_name} ${isEdit ? 'diperbarui' : 'ditambahkan'}.`,
            )
          }
        />
      )}
      {dialog?.type === 'import' && (
        <ImportExcelModal
          kind="teaching-assignments"
          title="Impor Pengampu dari Excel"
          description="Tetapkan banyak guru ke mapel & kelas sekaligus. Kelas, mapel, dan akun guru harus sudah ada."
          templateName="Template Impor Pengampu.xlsx"
          columns={[
            { key: 'classroom', header: 'Kelas' },
            { key: 'academic_year', header: 'Tahun Ajaran' },
            { key: 'subject', header: 'Mapel' },
            { key: 'teacher', header: 'Guru' },
          ]}
          onClose={closeDialog}
          onImported={(count) => done(`${count} pengampu berhasil diimpor.`)}
        />
      )}
      <DeleteDialog
        item={dialog?.type === 'delete' ? dialog.assignment : null}
        title="Hapus Pengampu"
        message={(a) =>
          `Hapus ${a.teacher_name} sebagai pengampu ${a.subject_name} di ${a.classroom_name}?`
        }
        onDelete={(a) => assignmentsApi.remove(a.id)}
        onDeleted={() => done('Data pengampu dihapus.')}
        onClose={closeDialog}
      />
    </>
  )
}
