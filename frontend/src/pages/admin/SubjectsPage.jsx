import {
  BookOpen,
  Calculator,
  Code2,
  FileSpreadsheet,
  FlaskConical,
  Hash,
  Languages,
  Library,
  Palette,
  Pencil,
  Plus,
  School,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useState } from 'react'
import { assignmentsApi, subjectsApi } from '../../api/academics'
import AdminCard, { CardGrid } from '../../components/AdminCard'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import DeleteDialog from '../../components/DeleteDialog'
import EmptyState from '../../components/EmptyState'
import { FilterChips } from '../../components/ExplorePanels'
import FormModal from '../../components/FormModal'
import ImportExcelModal from '../../components/ImportExcelModal'
import PageHero, { HeroButton } from '../../components/PageHero'
import Spinner from '../../components/Spinner'
import SubjectIcon from '../../components/SubjectIcon'
import TextField from '../../components/TextField'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'
import { ALL } from '../../utils/academic'
import { countWith, filterSubjects } from '../../utils/adminFilters'
import { subjectStyle } from '../../utils/subjectStyles'

const HERO_ICONS = [Library, BookOpen, Calculator, Code2, Languages, FlaskConical, Palette]

function SubjectFormModal({ subject, onClose, onSaved }) {
  const [form, setForm] = useState({ code: subject?.code ?? '', name: subject?.name ?? '' })
  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const saved = subject
      ? await subjectsApi.update(subject.id, form)
      : await subjectsApi.create(form)
    onSaved(saved, Boolean(subject))
  })
  const handleChange = (event) => setForm({ ...form, [event.target.name]: event.target.value })

  return (
    <FormModal
      title={subject ? 'Ubah Mapel' : 'Tambah Mapel'}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError}
    >
      <TextField
        label="Kode mapel"
        name="code"
        value={form.code}
        onChange={handleChange}
        error={errors.code}
        hint="Singkat dan unik, contoh: PWEB, PBO, BINDO."
        required
      />
      <TextField
        label="Nama mapel"
        name="name"
        value={form.name}
        onChange={handleChange}
        error={errors.name}
        hint="Ikon kartu dipilih otomatis dari nama mapel (mis. Matematika, Bahasa Inggris)."
        required
      />
    </FormModal>
  )
}

export default function SubjectsPage() {
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState(null)
  const subjects = useFetch(subjectsApi.list, ALL)
  const assignments = useFetch(assignmentsApi.list, ALL)

  const all = subjects.data?.results ?? []
  const shown = filterSubjects(all, search)
  const assignmentList = assignments.data?.results ?? []
  const classCount = countWith(assignmentList, (a) => a.subject)
  // Guru yang mengajar tiap mapel (tanpa duplikat), untuk ditampilkan di kartu.
  const teachersOf = (subjectId) => [
    ...new Set(assignmentList.filter((a) => a.subject === subjectId).map((a) => a.teacher_name)),
  ]
  const closeDialog = () => setDialog(null)
  const done = (message) => {
    closeDialog()
    setNotice(message)
    subjects.reload()
  }

  return (
    <>
      <PageHero
        title="Mata Pelajaran"
        description="Daftar mapel yang diajarkan di sekolah. Tetapkan guru pengampunya di menu Pengampu."
        icons={HERO_ICONS}
        centerIcon={Library}
        search={{
          value: search,
          onChange: setSearch,
          onSubmit: () =>
            document.getElementById('daftar-hasil')?.scrollIntoView({ behavior: 'smooth' }),
          placeholder: 'Cari kode atau nama mapel...',
        }}
        actions={
          <>
            <HeroButton icon={Plus} onClick={() => setDialog({ type: 'form', subject: null })}>
              Tambah Mapel
            </HeroButton>
            <HeroButton icon={FileSpreadsheet} onClick={() => setDialog({ type: 'import' })}>
              Impor Excel
            </HeroButton>
          </>
        }
        stats={[
          {
            icon: Library,
            content: (
              <>
                <strong className="text-white">{all.length} mata pelajaran</strong>
              </>
            ),
          },
          {
            icon: School,
            content: (
              <>
                diajarkan di <strong className="text-white">{assignmentList.length}</strong>{' '}
                kelas-mapel
              </>
            ),
          },
        ]}
      />

      <section id="daftar-hasil" className="mt-8 scroll-mt-4">
        <FilterChips
          count={shown.length}
          chips={search.trim() ? [{ key: 'search', label: `“${search.trim()}”` }] : []}
          onRemove={() => setSearch('')}
          onClear={() => setSearch('')}
        />
        <div className="mb-3 space-y-3">
          <Alert type="success">{notice}</Alert>
          <Alert type="error">{subjects.error}</Alert>
        </div>

        {subjects.loading && !subjects.data ? (
          <div className="py-10 text-center text-brand-600">
            <Spinner />
          </div>
        ) : shown.length === 0 ? (
          <EmptyState title={all.length ? 'Tidak ada mapel yang cocok.' : 'Belum ada mapel.'}>
            {all.length ? 'Coba kata kunci lain.' : 'Klik “Tambah Mapel” atau impor dari Excel.'}
          </EmptyState>
        ) : (
          <CardGrid>
            {shown.map((subject) => {
              const teachers = teachersOf(subject.id)
              return (
                <AdminCard
                  key={subject.id}
                  tone={subjectStyle(subject.name).soft}
                  icon={<SubjectIcon name={subject.name} size="md" />}
                  title={subject.name}
                  badges={
                    <Badge color="gray">
                      <Hash className="mr-0.5 size-3" aria-hidden="true" />
                      {subject.code}
                    </Badge>
                  }
                  meta={[
                    {
                      icon: School,
                      content: classCount[subject.id] ? (
                        `Diajarkan di ${classCount[subject.id]} kelas`
                      ) : (
                        <span className="text-amber-700">Belum ada pengampu</span>
                      ),
                    },
                    teachers.length > 0 && {
                      icon: UserRound,
                      content: `Guru: ${teachers.join(', ')}`,
                    },
                  ]}
                  actions={
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDialog({ type: 'form', subject })}
                      >
                        <Pencil className="size-4" aria-hidden="true" /> Ubah
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => setDialog({ type: 'delete', subject })}
                      >
                        <Trash2 className="size-4" aria-hidden="true" /> Hapus
                      </Button>
                    </>
                  }
                />
              )
            })}
          </CardGrid>
        )}
      </section>

      {dialog?.type === 'form' && (
        <SubjectFormModal
          subject={dialog.subject}
          onClose={closeDialog}
          onSaved={(saved, isEdit) =>
            done(`Mapel ${saved.name} ${isEdit ? 'diperbarui' : 'ditambahkan'}.`)
          }
        />
      )}
      {dialog?.type === 'import' && (
        <ImportExcelModal
          kind="subjects"
          title="Impor Mata Pelajaran dari Excel"
          description="Tambah banyak mata pelajaran sekaligus. Kode dibuat huruf besar otomatis."
          templateName="Template Impor Mapel.xlsx"
          columns={[
            { key: 'code', header: 'Kode' },
            { key: 'name', header: 'Nama Mapel' },
          ]}
          onClose={closeDialog}
          onImported={(count) => done(`${count} mata pelajaran berhasil diimpor.`)}
        />
      )}
      <DeleteDialog
        item={dialog?.type === 'delete' ? dialog.subject : null}
        title="Hapus Mapel"
        message={(s) => `Hapus mapel ${s.code} - ${s.name}?`}
        onDelete={(s) => subjectsApi.remove(s.id)}
        onDeleted={(s) => done(`Mapel ${s.name} dihapus.`)}
        onClose={closeDialog}
      />
    </>
  )
}
