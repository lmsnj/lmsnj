import {
  BookOpen,
  CalendarDays,
  DoorOpen,
  FileSpreadsheet,
  GraduationCap,
  LayoutGrid,
  Pencil,
  Plus,
  School,
  Sprout,
  Trash2,
  TreePine,
  Trees,
  UserRound,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { classroomsApi } from '../../api/academics'
import AdminCard, { CardGrid } from '../../components/AdminCard'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import DeleteDialog from '../../components/DeleteDialog'
import EmptyState from '../../components/EmptyState'
import { FilterChips, OptionPanel } from '../../components/ExplorePanels'
import ImportExcelModal from '../../components/ImportExcelModal'
import PageHero, { HeroButton } from '../../components/PageHero'
import Spinner from '../../components/Spinner'
import SubjectIcon from '../../components/SubjectIcon'
import useFetch from '../../hooks/useFetch'
import { ALL } from '../../utils/academic'
import { countWith, filterClassrooms, sumOf } from '../../utils/adminFilters'
import { subjectStyle } from '../../utils/subjectStyles'
import ClassroomFormModal from './ClassroomFormModal'

const EMPTY = { search: '', grade: '', year: '' }
const GRADE_OPTIONS = [
  { id: 'X', title: 'Kelas X', description: 'Tingkat pertama', icon: Sprout, tile: 'bg-brand-100 text-brand-700' },
  { id: 'XI', title: 'Kelas XI', description: 'Tingkat kedua', icon: TreePine, tile: 'bg-blue-100 text-blue-600' },
  { id: 'XII', title: 'Kelas XII', description: 'Tingkat akhir', icon: Trees, tile: 'bg-amber-100 text-amber-700' },
] // prettier-ignore
const HERO_ICONS = [School, Users, DoorOpen, CalendarDays, BookOpen, GraduationCap, LayoutGrid]

export default function ClassroomsPage() {
  const [filters, setFilters] = useState(EMPTY)
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState(null)
  const classrooms = useFetch(classroomsApi.list, ALL)

  const all = classrooms.data?.results ?? []
  const shown = filterClassrooms(all, filters)
  const years = [...new Set(all.map((c) => c.academic_year))].sort().reverse()
  const yearOptions = years.map((year, index) => ({
    id: year,
    title: `Tahun Ajaran ${year}`,
    description: index === 0 ? 'Tahun ajaran terbaru' : 'Tahun ajaran sebelumnya',
    icon: CalendarDays,
    tile: index === 0 ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600',
  }))
  const set = (changes) => setFilters((current) => ({ ...current, ...changes }))
  const closeDialog = () => setDialog(null)
  const done = (message) => {
    closeDialog()
    setNotice(message)
    classrooms.reload()
  }
  const chips = [
    filters.grade && { key: 'grade', label: `Kelas ${filters.grade}` },
    filters.year && { key: 'year', label: filters.year },
    filters.search.trim() && { key: 'search', label: `“${filters.search.trim()}”` },
  ].filter(Boolean)

  return (
    <>
      <div className="space-y-6">
        <PageHero
          title="Ruang Kelas"
          description="Kelola kelas, wali kelas, dan siswanya. Klik nama kelas untuk mengatur siswa dan mapel."
          icons={HERO_ICONS}
          centerIcon={School}
          search={{
            value: filters.search,
            onChange: (search) => set({ search }),
            onSubmit: () =>
              document.getElementById('daftar-hasil')?.scrollIntoView({ behavior: 'smooth' }),
            placeholder: 'Cari nama kelas, jurusan, atau wali kelas...',
          }}
          actions={
            <>
              <HeroButton icon={Plus} onClick={() => setDialog({ type: 'form', classroom: null })}>
                Tambah Kelas
              </HeroButton>
              <HeroButton icon={FileSpreadsheet} onClick={() => setDialog({ type: 'import' })}>
                Impor Excel
              </HeroButton>
            </>
          }
          stats={[
            {
              icon: School,
              content: (
                <>
                  <strong className="text-white">{all.length} kelas</strong> di {years.length} tahun
                  ajaran
                </>
              ),
            },
            {
              icon: Users,
              content: (
                <>
                  <strong className="text-white">{sumOf(all, 'student_count')} siswa</strong> sudah
                  masuk kelas
                </>
              ),
            },
          ]}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <OptionPanel
            title="Tingkat Kelas"
            options={GRADE_OPTIONS}
            counts={countWith(all, (c) => c.grade)}
            selected={filters.grade}
            onSelect={(grade) => set({ grade })}
            resetLabel="Semua"
          />
          <OptionPanel
            title="Tahun Ajaran"
            options={yearOptions}
            counts={countWith(all, (c) => c.academic_year)}
            selected={filters.year}
            onSelect={(year) => set({ year })}
            resetLabel="Semua"
          />
        </div>
      </div>

      <section id="daftar-hasil" className="mt-8 scroll-mt-4">
        <FilterChips
          count={shown.length}
          chips={chips}
          onRemove={(key) => set({ [key]: '' })}
          onClear={() => setFilters(EMPTY)}
        />
        <div className="mb-3 space-y-3">
          <Alert type="success">{notice}</Alert>
          <Alert type="error">{classrooms.error}</Alert>
        </div>

        {classrooms.loading && !classrooms.data ? (
          <div className="py-10 text-center text-brand-600">
            <Spinner />
          </div>
        ) : shown.length === 0 ? (
          <EmptyState title={all.length ? 'Tidak ada kelas yang cocok.' : 'Belum ada kelas.'}>
            {all.length
              ? 'Coba kata kunci lain atau hapus penyaring.'
              : 'Klik “Tambah Kelas” atau impor dari Excel.'}
          </EmptyState>
        ) : (
          <CardGrid>
            {shown.map((classroom) => (
              <AdminCard
                key={classroom.id}
                tone={subjectStyle(classroom.name).soft}
                icon={<SubjectIcon name={classroom.name} size="md" />}
                title={classroom.name}
                to={`/admin/kelas/${classroom.id}`}
                subtitle={`Jurusan ${classroom.major}`}
                badges={<Badge color="gray">Kelas {classroom.grade}</Badge>}
                meta={[
                  { icon: Users, content: `${classroom.student_count} siswa` },
                  {
                    icon: UserRound,
                    content: classroom.homeroom_teacher_name ? (
                      <>Wali kelas: {classroom.homeroom_teacher_name}</>
                    ) : (
                      <span className="text-amber-700">Wali kelas belum ditentukan</span>
                    ),
                  },
                  { icon: CalendarDays, content: `Tahun Ajaran ${classroom.academic_year}` },
                ]}
                actions={
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialog({ type: 'form', classroom })}
                    >
                      <Pencil className="size-4" aria-hidden="true" /> Ubah
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => setDialog({ type: 'delete', classroom })}
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
        <ClassroomFormModal
          classroom={dialog.classroom}
          onClose={closeDialog}
          onSaved={(saved, isEdit) =>
            done(`Kelas ${saved.name} ${isEdit ? 'diperbarui' : 'ditambahkan'}.`)
          }
        />
      )}
      {dialog?.type === 'import' && (
        <ImportExcelModal
          kind="classrooms"
          title="Impor Kelas dari Excel"
          description="Tambah banyak kelas sekaligus beserta wali kelasnya (username guru)."
          templateName="Template Impor Kelas.xlsx"
          columns={[
            { key: 'name', header: 'Kelas' },
            { key: 'grade', header: 'Tingkat' },
            { key: 'major', header: 'Jurusan' },
            { key: 'academic_year', header: 'Tahun Ajaran' },
            { key: 'homeroom', header: 'Wali Kelas' },
          ]}
          onClose={closeDialog}
          onImported={(count) => done(`${count} kelas berhasil diimpor.`)}
        />
      )}
      <DeleteDialog
        item={dialog?.type === 'delete' ? dialog.classroom : null}
        title="Hapus Kelas"
        message={(c) =>
          `Hapus kelas ${c.name} (${c.academic_year})? ${c.student_count} siswa di dalamnya akan menjadi "belum punya kelas".`
        }
        onDelete={(c) => classroomsApi.remove(c.id)}
        onDeleted={(c) => done(`Kelas ${c.name} dihapus.`)}
        onClose={closeDialog}
      />
    </>
  )
}
