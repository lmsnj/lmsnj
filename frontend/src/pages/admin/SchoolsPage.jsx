import {
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Copy,
  ExternalLink,
  GraduationCap,
  Hash,
  KeyRound,
  Pencil,
  Plus,
  School,
  Trash2,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { BASE_DOMAIN } from '../../api/client'
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
import Modal from '../../components/Modal'
import PageHero, { HeroButton } from '../../components/PageHero'
import SelectField from '../../components/SelectField'
import Spinner from '../../components/Spinner'
import TextField from '../../components/TextField'
import useAuth from '../../hooks/useAuth'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'
import useQueryFlag from '../../hooks/useQueryFlag'
import { SCHOOL_LEVELS } from '../../utils/constants'
import { schoolAddress } from '../../utils/tenant'

const HERO_ICONS = [Building2, School, GraduationCap, Users, BookOpen, ClipboardCheck]
const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

// Alamat subdomain sekolah, mengikuti protokol & port alamat yang sedang dibuka (laptop: http + 5173).
function addressOf(code) {
  return schoolAddress(code, BASE_DOMAIN, {
    protocol: window.location.protocol,
    port: window.location.port,
  })
}

const withoutProtocol = (url) => url?.replace(/^https?:\/\//, '')

function SchoolFormModal({ school, onClose, onSaved }) {
  const [form, setForm] = useState({
    code: school?.code ?? '',
    name: school?.name ?? '',
    level: school?.level ?? 'smk',
    slogan: school?.slogan ?? '',
    is_active: school?.is_active ?? true,
    // Akun admin pertama, hanya saat membuat sekolah baru (opsional).
    admin_username: '',
    admin_full_name: '',
    admin_password: '',
  })
  const [logo, setLogo] = useState(null)
  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const data = { ...form, logo: logo ?? undefined }
    if (school) {
      delete data.admin_username
      delete data.admin_full_name
      delete data.admin_password
    }
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
          hint={
            BASE_DOMAIN
              ? `Menjadi alamat sekolah: ${withoutProtocol(addressOf(form.code.toLowerCase() || 'kode'))}`
              : 'Huruf kecil, angka, dan tanda hubung, mis. mtsnj.'
          }
          // Kode = alamat sekolah; mengubahnya memutus alamat yang sudah dibagikan ke pengguna.
          disabled={Boolean(school)}
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
        hint="PNG, JPG, WEBP, atau GIF, maks. 2 MB. Kosong = memakai logo aplikasi."
      />
      {!school && (
        <fieldset className="space-y-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <legend className="px-1 text-sm font-semibold text-slate-800">
            Akun admin sekolah (opsional)
          </legend>
          <p className="-mt-2 text-xs text-slate-500">
            Isi agar sekolah langsung bisa dipakai. Admin sekolah yang mengelola guru, siswa, dan
            kelas.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Username admin"
              name="admin_username"
              value={form.admin_username}
              onChange={handleChange}
              error={errors.admin_username}
              autoComplete="off"
            />
            <TextField
              label="Nama lengkap admin"
              name="admin_full_name"
              value={form.admin_full_name}
              onChange={handleChange}
              error={errors.admin_full_name}
            />
          </div>
          <TextField
            label="Password admin"
            name="admin_password"
            type="password"
            value={form.admin_password}
            onChange={handleChange}
            error={errors.admin_password}
            autoComplete="new-password"
            hint="Kosongkan agar dibuat otomatis (ditampilkan sekali setelah disimpan)."
          />
        </fieldset>
      )}
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

// Ditampilkan sekali setelah sekolah baru dibuat bersama akun adminnya: alamat + data masuk.
function NewSchoolCredentials({ school, onClose }) {
  const [copied, setCopied] = useState(false)
  const address = addressOf(school.code)
  const { admin } = school
  const lines = [
    `Sekolah: ${school.name}`,
    address && `Alamat: ${address}`,
    `Username: ${admin.username}`,
    admin.password && `Password: ${admin.password}`,
  ].filter(Boolean)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
    } catch {
      setCopied(false) // browser menolak akses clipboard; data tetap terlihat untuk disalin manual
    }
  }

  return (
    <Modal
      open
      title="Sekolah siap dipakai"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={copy}>
            <Copy className="size-4" aria-hidden="true" /> {copied ? 'Tersalin' : 'Salin'}
          </Button>
          <Button onClick={onClose}>Selesai</Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-700">
        <p>
          Berikan data berikut kepada admin <strong>{school.name}</strong>.
        </p>
        <dl className="space-y-2 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          {address && (
            <div>
              <dt className="text-xs text-slate-500">Alamat</dt>
              <dd className="font-semibold break-all text-slate-900">{withoutProtocol(address)}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-slate-500">Username</dt>
            <dd className="font-semibold text-slate-900">{admin.username}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Password</dt>
            <dd className="font-mono font-semibold text-slate-900">
              {admin.password ?? 'Sesuai yang Anda isi di formulir'}
            </dd>
          </div>
        </dl>
        {admin.password && (
          <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200">
            <KeyRound className="size-4 shrink-0" aria-hidden="true" />
            Password ini hanya tampil sekali. Minta admin menggantinya setelah masuk pertama kali.
          </p>
        )}
      </div>
    </Modal>
  )
}

// Daftar Sekolah (khusus Super Admin): tambah/ubah/nonaktifkan sekolah + ringkasan tiap sekolah.
export default function SchoolsPage() {
  const { reloadSchools } = useAuth()
  const [notice, setNotice] = useState('')
  // ?baru=1 dari tombol "Tambah Sekolah" di Beranda yayasan langsung membuka form.
  const openNew = useQueryFlag('baru')
  const [dialog, setDialog] = useState(() => (openNew ? { type: 'form', school: null } : null))
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
        description="Sekolah pengguna aplikasi. Setiap sekolah punya alamat sendiri (subdomain). Buka sebuah sekolah lewat “Ganti Sekolah” di header untuk mengelola kelas, mapel, dan penggunanya."
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
                  BASE_DOMAIN
                    ? {
                        icon: ExternalLink,
                        content: (
                          <a
                            href={addressOf(school.code)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium break-all text-brand-700 hover:underline"
                          >
                            {withoutProtocol(addressOf(school.code))}
                          </a>
                        ),
                      }
                    : { icon: Hash, content: `Kode: ${school.code}` },
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
          onSaved={(saved, isEdit) => {
            done(`Sekolah ${saved.name} ${isEdit ? 'diperbarui' : 'ditambahkan'}.`)
            if (saved.admin) setDialog({ type: 'credentials', school: saved })
          }}
        />
      )}
      {dialog?.type === 'credentials' && (
        <NewSchoolCredentials school={dialog.school} onClose={closeDialog} />
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
