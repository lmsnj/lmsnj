import {
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  Hash,
  Pencil,
  Plus,
  School,
  Trash2,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { schoolsApi } from '../../api/schools'
import AdminCard, { CardGrid } from '../../components/AdminCard'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import { SchoolLogoBox } from '../../components/brand/SchoolLogo'
import DeleteDialog from '../../components/DeleteDialog'
import EmptyState from '../../components/EmptyState'
import FileInput from '../../components/FileInput'
import FormModal from '../../components/FormModal'
import PageHero, { HeroButton } from '../../components/PageHero'
import SelectField from '../../components/SelectField'
import Spinner from '../../components/Spinner'
import TextField from '../../components/TextField'
import useAuth from '../../hooks/useAuth'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'
import { SCHOOL_LEVELS } from '../../utils/constants'

const HERO_ICONS = [Building2, School, GraduationCap, Users, BookOpen, ClipboardCheck]
const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

function SchoolFormModal({ school, onClose, onSaved }) {
  const [form, setForm] = useState({
    code: school?.code ?? '',
    name: school?.name ?? '',
    level: school?.level ?? 'smk',
    slogan: school?.slogan ?? '',
    is_active: school?.is_active ?? true,
  })
  const [logo, setLogo] = useState(null)
  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const data = { ...form, logo: logo ?? undefined }
    const saved = school ? await schoolsApi.update(school.id, data) : await schoolsApi.create(data)
    onSaved(saved, Boolean(school))
  })
  const handleChange = (event) => {
    const { name, value, type, checked } = event.target
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value })
  }

  return (
    <FormModal
      title={school ? 'Ubah Sekolah' : 'Tambah Sekolah'}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError}
    >
      <TextField
        label="Nama sekolah"
        name="name"
        value={form.name}
        onChange={handleChange}
        error={errors.name}
        hint="Contoh: MTs Nurul Jadid. Tampil di header setelah sekolah dibuka."
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Kode"
          name="code"
          value={form.code}
          onChange={handleChange}
          error={errors.code}
          hint="Singkatan unik, huruf kecil, mis. mtsnj."
          required
        />
        <SelectField
          label="Jenjang"
          name="level"
          value={form.level}
          onChange={handleChange}
          options={SCHOOL_LEVELS}
          error={errors.level}
        />
      </div>
      <p className="-mt-2 text-xs text-slate-500">
        Jenjang menentukan tingkat kelas: SD/MI I–VI, SMP/MTs VII–IX, SMA/MA/SMK X–XII.
      </p>
      <TextField
        label="Slogan"
        name="slogan"
        value={form.slogan}
        onChange={handleChange}
        error={errors.slogan}
        hint="Opsional."
      />
      <FileInput
        label="Logo (opsional)"
        accept={LOGO_ACCEPT}
        onChange={setLogo}
        error={errors.logo}
        hint="PNG, JPG, WEBP, atau GIF, maks. 2 MB. Kosong = memakai logo yayasan."
      />
      {school && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="is_active"
            checked={form.is_active}
            onChange={handleChange}
            className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
          />
          Sekolah aktif (bisa dibuka pengguna)
        </label>
      )}
    </FormModal>
  )
}

// Daftar Sekolah (khusus admin yayasan): tambah/ubah/nonaktifkan sekolah + ringkasan tiap sekolah.
export default function SchoolsPage() {
  const { reloadSchools } = useAuth()
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState(null)
  const summary = useFetch(schoolsApi.summary)

  const schools = summary.data ?? []
  const total = (key) => schools.reduce((sum, school) => sum + (school[key] ?? 0), 0)
  const closeDialog = () => setDialog(null)
  const done = (message) => {
    closeDialog()
    setNotice(message)
    summary.reload()
    reloadSchools() // pilihan "Ganti Sekolah" di header ikut diperbarui
  }

  return (
    <>
      <PageHero
        title="Daftar Sekolah"
        description="Sekolah-sekolah di bawah yayasan. Buka sebuah sekolah lewat tombol “Ganti Sekolah” di header untuk mengelola kelas, mapel, dan penggunanya."
        icons={HERO_ICONS}
        centerIcon={Building2}
        actions={
          <HeroButton icon={Plus} onClick={() => setDialog({ type: 'form', school: null })}>
            Tambah Sekolah
          </HeroButton>
        }
        stats={[
          {
            icon: Building2,
            content: <strong className="text-white">{schools.length} sekolah</strong>,
          },
          {
            icon: GraduationCap,
            content: (
              <>
                <strong className="text-white">{total('students')}</strong> siswa aktif
              </>
            ),
          },
          {
            icon: Users,
            content: (
              <>
                <strong className="text-white">{total('teachers')}</strong> guru aktif
              </>
            ),
          },
        ]}
      />

      <section className="mt-8">
        <div className="mb-3 space-y-3">
          <Alert type="success">{notice}</Alert>
          <Alert type="error">{summary.error}</Alert>
        </div>

        {summary.loading && !summary.data ? (
          <div className="py-10 text-center text-brand-600">
            <Spinner />
          </div>
        ) : schools.length === 0 ? (
          <EmptyState title="Belum ada sekolah.">
            Klik “Tambah Sekolah” untuk menambahkan sekolah pertama.
          </EmptyState>
        ) : (
          <CardGrid>
            {schools.map((school) => (
              <AdminCard
                key={school.id}
                tone={school.is_active ? 'bg-brand-50' : 'bg-slate-100'}
                icon={<SchoolLogoBox school={school} />}
                title={school.name}
                subtitle={school.slogan}
                badges={
                  <>
                    <Badge color="green">{school.level_display}</Badge>
                    {!school.is_active && <Badge color="red">Nonaktif</Badge>}
                  </>
                }
                meta={[
                  { icon: Hash, content: `Kode: ${school.code}` },
                  {
                    icon: CalendarDays,
                    content: school.academic_year
                      ? `Tahun ajaran ${school.academic_year} · ${school.classrooms} kelas`
                      : 'Belum ada kelas',
                  },
                  {
                    icon: Users,
                    content: `${school.students} siswa · ${school.teachers} guru · ${school.admins} admin`,
                  },
                  {
                    icon: BookOpen,
                    content: `${school.subjects} mapel · ${school.materials} materi · ${school.tasks} tugas`,
                  },
                ]}
                actions={
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialog({ type: 'form', school })}
                    >
                      <Pencil className="size-4" aria-hidden="true" /> Ubah
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => setDialog({ type: 'delete', school })}
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
        <SchoolFormModal
          school={dialog.school}
          onClose={closeDialog}
          onSaved={(saved, isEdit) =>
            done(`Sekolah ${saved.name} ${isEdit ? 'diperbarui' : 'ditambahkan'}.`)
          }
        />
      )}
      <DeleteDialog
        item={dialog?.type === 'delete' ? dialog.school : null}
        title="Hapus Sekolah"
        message={(s) =>
          `Hapus ${s.name}? Sekolah yang sudah punya kelas atau mapel tidak bisa dihapus — nonaktifkan saja.`
        }
        onDelete={(s) => schoolsApi.remove(s.id)}
        onDeleted={(s) => done(`Sekolah ${s.name} dihapus.`)}
        onClose={closeDialog}
      />
    </>
  )
}
