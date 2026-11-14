import {
  BadgeCheck,
  BookUser,
  Building2,
  Contact,
  FileSpreadsheet,
  GraduationCap,
  IdCard,
  KeyRound,
  Link2,
  Mail,
  Pencil,
  School,
  ShieldCheck,
  SquareCheckBig,
  Trash2,
  UserCog,
  UserPlus,
  UserRoundX,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { classroomsApi } from '../../api/academics'
import { usersApi } from '../../api/users'
import AdminCard, { CardGrid } from '../../components/AdminCard'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import { Avatar } from '../../components/ClassHero'
import DeleteDialog from '../../components/DeleteDialog'
import EmptyState from '../../components/EmptyState'
import FormModal from '../../components/FormModal'
import { FilterChips, OptionPanel, SubjectPanel } from '../../components/ExplorePanels'
import PageHero, { HeroButton } from '../../components/PageHero'
import Pagination from '../../components/Pagination'
import Spinner from '../../components/Spinner'
import TextField from '../../components/TextField'
import useAuth from '../../hooks/useAuth'
import useDebounce from '../../hooks/useDebounce'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'
import useQueryFlag from '../../hooks/useQueryFlag'
import { ALL } from '../../utils/academic'
import { ROLE_LABELS, ROLES } from '../../utils/constants'
import AccountCardsModal from './AccountCardsModal'
import ImportUsersModal from './ImportUsersModal'
import UpdateUsersModal from './UpdateUsersModal'
import ResetPasswordModal from './ResetPasswordModal'
import UserFormModal from './UserFormModal'
import SplitExplorer from '../../components/SplitExplorer'
import { revealResults } from '../../utils/results'

const ROLE_COLORS = {
  [ROLES.FOUNDATION]: 'green',
  [ROLES.ADMIN]: 'amber',
  [ROLES.TEACHER]: 'blue',
  [ROLES.STUDENT]: 'gray',
}

// Guru yang juga mengajar di sekolah lain memakai akun yang sama: cukup didaftarkan ke sekolah ini.
function JoinUserModal({ onClose, onJoined }) {
  const [username, setUsername] = useState('')
  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    onJoined(await usersApi.join(username))
  })
  return (
    <FormModal
      title="Tambah dari Sekolah Lain"
      submitLabel="Daftarkan"
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError}
    >
      <p className="text-sm text-slate-600">
        Untuk guru atau admin yang sudah punya akun di sekolah lain di aplikasi ini. Akunnya tetap
        satu (username & password sama); ia bisa berpindah sekolah lewat tombol “Ganti Sekolah”.
      </p>
      <TextField
        label="Username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        error={errors.username}
        autoComplete="off"
        required
      />
    </FormModal>
  )
}
const EMPTY = { search: '', group: '', classroom: '', is_active: '' }

// Pilihan di panel "Peran Pengguna". `params` = filter yang dikirim ke API.
const GROUPS = [
  {
    id: 'admin',
    title: 'Admin',
    description: 'Pengelola data sekolah',
    icon: ShieldCheck,
    tile: 'bg-amber-100 text-amber-700',
    params: { role: ROLES.ADMIN },
  },
  {
    id: 'guru',
    title: 'Guru',
    description: 'Pengampu mapel & wali kelas',
    icon: UserCog,
    tile: 'bg-blue-100 text-blue-600',
    params: { role: ROLES.TEACHER },
  },
  {
    id: 'siswa',
    title: 'Siswa',
    description: 'Peserta didik di semua kelas',
    icon: GraduationCap,
    tile: 'bg-brand-100 text-brand-700',
    params: { role: ROLES.STUDENT },
  },
  {
    id: 'tanpa-kelas',
    title: 'Siswa Tanpa Kelas',
    description: 'Perlu dimasukkan ke kelas',
    icon: UserRoundX,
    tile: 'bg-red-100 text-red-600',
    params: { role: ROLES.STUDENT, classroom__isnull: true },
  },
]
const STATUS_OPTIONS = [
  { value: '', label: 'Semua' },
  { value: 'true', label: 'Aktif' },
  { value: 'false', label: 'Nonaktif' },
]
const HERO_ICONS = [Users, UserPlus, GraduationCap, School, BadgeCheck, KeyRound, UserCog]

// Jumlah pengguna per peran untuk panel & banner (cukup minta 1 baris, angka dari `count`).
function useRoleCounts() {
  const admin = useFetch(usersApi.list, { role: ROLES.ADMIN, page_size: 1 })
  const guru = useFetch(usersApi.list, { role: ROLES.TEACHER, page_size: 1 })
  const siswa = useFetch(usersApi.list, { role: ROLES.STUDENT, page_size: 1 })
  const noClass = useFetch(usersApi.list, {
    role: ROLES.STUDENT,
    classroom__isnull: true,
    page_size: 1,
  })
  const all = { admin, guru, siswa, 'tanpa-kelas': noClass }
  const counts = Object.fromEntries(
    Object.entries(all).map(([key, result]) => [key, result.data?.count ?? 0]),
  )
  const reload = () => Object.values(all).forEach((result) => result.reload())
  return [counts, reload]
}

export default function UsersPage() {
  const { user: currentUser, school } = useAuth()
  const [filters, setFilters] = useState(EMPTY)
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState('')
  // Modal yang sedang terbuka: { type: 'form' | 'reset' | 'delete' | 'import', user }
  // Tombol Beranda membuka halaman ini dengan ?baru=1 (tambah) atau ?impor=1 (impor Excel).
  const openNew = useQueryFlag('baru') === '1'
  const openImport = useQueryFlag('impor') === '1'
  const [dialog, setDialog] = useState(() =>
    openImport ? { type: 'import' } : openNew ? { type: 'form', user: null } : null,
  )

  const search = useDebounce(filters.search)
  const group = GROUPS.find((g) => g.id === filters.group)
  const params = { page, is_active: filters.is_active, search, ...group?.params }
  if (filters.classroom) params.classroom = filters.classroom

  const users = useFetch(usersApi.list, params)
  const classrooms = useFetch(classroomsApi.list, ALL)
  const [counts, reloadCounts] = useRoleCounts()
  const total = counts.admin + counts.guru + counts.siswa

  const change = (changes) => {
    setFilters((current) => ({ ...current, ...changes }))
    setPage(1)
  }
  // Klik panel penyaring: terapkan lalu pastikan daftar hasil terlihat (di HP ada di bawah).
  const pick = (changes) => {
    change(changes)
    revealResults()
  }
  const closeDialog = () => setDialog(null)
  const handleSaved = (saved, isEdit) => {
    closeDialog()
    setNotice(isEdit ? `Data ${saved.full_name} diperbarui.` : `${saved.full_name} ditambahkan.`)
    users.reload()
    reloadCounts()
    classrooms.reload()
  }
  const handleDeleted = (user) => {
    closeDialog()
    setNotice(
      user.schools.length > 1
        ? `${user.full_name} dikeluarkan dari sekolah ini.`
        : `${user.full_name} dihapus.`,
    )
    // Jika data terakhir di halaman ini terhapus, mundur satu halaman.
    if (users.data?.results.length === 1 && page > 1) setPage(page - 1)
    else users.reload()
    reloadCounts()
    classrooms.reload()
  }

  // Kartu kelas di panel kiri: jumlah siswa per kelas.
  const classroomItems = (classrooms.data?.results ?? []).map((c) => ({
    ...c,
    subject_name: c.name,
  }))
  const classroom = classroomItems.find((c) => String(c.id) === String(filters.classroom))
  const chips = [
    group && { key: 'group', label: group.title },
    classroom && { key: 'classroom', label: `Kelas ${classroom.name}` },
    filters.is_active && {
      key: 'is_active',
      label: filters.is_active === 'true' ? 'Aktif' : 'Nonaktif',
    },
    filters.search.trim() && { key: 'search', label: `“${filters.search.trim()}”` },
  ].filter(Boolean)
  const list = users.data?.results ?? []

  // Mode pilih (cetak kartu akun): pilihan disimpan per id agar tetap ada saat pindah halaman
  // atau mengganti penyaring. Super Admin tidak bisa dipilih (tidak punya kartu sekolah).
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState({}) // { [id]: user }
  const selectedCount = Object.keys(selected).length
  const selectable = list.filter((user) => user.role !== ROLES.FOUNDATION)
  const toggleUser = (user, checked) =>
    setSelected((current) => {
      const next = { ...current }
      if (checked) next[user.id] = user
      else delete next[user.id]
      return next
    })
  const selectPage = () =>
    setSelected((current) => ({
      ...current,
      ...Object.fromEntries(selectable.map((user) => [user.id, user])),
    }))
  const stopSelecting = () => {
    setSelecting(false)
    setSelected({})
  }

  return (
    <>
      <PageHero
        title="Pengguna"
        description="Kelola akun admin, guru, dan siswa. Tambahkan satu per satu atau impor sekaligus dari Excel."
        icons={HERO_ICONS}
        centerIcon={Users}
        search={{
          value: filters.search,
          onChange: (value) => change({ search: value }),
          onSubmit: revealResults,
          placeholder: 'Cari nama, username, NIS, atau NIP...',
        }}
        actions={
          <>
            <HeroButton icon={UserPlus} onClick={() => setDialog({ type: 'form', user: null })}>
              Tambah Pengguna
            </HeroButton>
            <HeroButton icon={FileSpreadsheet} onClick={() => setDialog({ type: 'import' })}>
              Impor Excel
            </HeroButton>
            <HeroButton icon={BookUser} onClick={() => setDialog({ type: 'update' })}>
              Lengkapi NIS/NIP
            </HeroButton>
            <HeroButton icon={Link2} onClick={() => setDialog({ type: 'join' })}>
              Dari Sekolah Lain
            </HeroButton>
            <HeroButton icon={IdCard} onClick={() => setDialog({ type: 'cards' })}>
              Cetak Kartu Akun
            </HeroButton>
          </>
        }
        stats={[
          {
            icon: Users,
            content: (
              <>
                <strong className="text-white">{total} pengguna</strong> terdaftar
              </>
            ),
          },
          {
            icon: GraduationCap,
            content: (
              <>
                <strong className="text-white">{counts.guru} guru</strong> ·{' '}
                <strong className="text-white">{counts.siswa} siswa</strong>
              </>
            ),
          },
        ]}
      />
      <SplitExplorer
        filters={
          <>
            <OptionPanel
              title="Peran Pengguna"
              options={GROUPS}
              counts={counts}
              selected={filters.group}
              onSelect={(id) =>
                pick({ group: id, classroom: id === 'tanpa-kelas' ? '' : filters.classroom })
              }
              resetLabel="Semua"
            />
            <SubjectPanel
              title="Siswa per Kelas"
              emptyText="Belum ada kelas."
              assignments={classroomItems}
              counts={Object.fromEntries(classroomItems.map((c) => [c.id, c.student_count]))}
              unit="siswa"
              selected={filters.classroom}
              onSelect={(id) =>
                pick({
                  classroom: id,
                  group: id && filters.group === 'tanpa-kelas' ? '' : filters.group,
                })
              }
              label={(c) => c.name}
              sublabel={(c) => c.academic_year}
            />
          </>
        }
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <FilterChips
            className=""
            count={users.data?.count ?? 0}
            chips={chips}
            onRemove={(key) => change({ [key]: '' })}
            onClear={() => change(EMPTY)}
          />
          <div
            className="flex gap-1 rounded-lg bg-slate-100 p-1"
            role="group"
            aria-label="Status akun"
          >
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => change({ is_active: option.value })}
                aria-pressed={filters.is_active === option.value}
                className={`rounded-md px-3 py-1 text-sm ${
                  filters.is_active === option.value
                    ? 'bg-white font-medium shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button
            variant={selecting ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            aria-pressed={selecting}
          >
            <SquareCheckBig className="size-4" aria-hidden="true" />
            {selecting ? 'Selesai Memilih' : 'Pilih'}
          </Button>
        </div>
        {selecting && (
          <p className="mb-3 text-sm text-slate-600">
            Centang pengguna yang akan dibuatkan kartu akun. Pilihan tetap tersimpan saat pindah
            halaman atau mengganti penyaring.
          </p>
        )}

        <div className="mb-3 space-y-3">
          <Alert type="success">{notice}</Alert>
          <Alert type="error">{users.error}</Alert>
        </div>

        {users.loading && !users.data ? (
          <div className="py-10 text-center text-brand-600">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <EmptyState title="Belum ada pengguna yang cocok.">
            Coba kata kunci lain atau hapus penyaring.
          </EmptyState>
        ) : (
          <CardGrid>
            {list.map((user) => (
              <AdminCard
                key={user.id}
                selection={
                  selecting && user.role !== ROLES.FOUNDATION
                    ? {
                        checked: Boolean(selected[user.id]),
                        onChange: (checked) => toggleUser(user, checked),
                      }
                    : undefined
                }
                icon={<Avatar name={user.full_name} className="size-12 text-lg" />}
                title={user.full_name}
                subtitle={`@${user.username}`}
                badges={
                  <>
                    <Badge color={ROLE_COLORS[user.role]}>{ROLE_LABELS[user.role]}</Badge>
                    {!user.is_active && <Badge color="red">Nonaktif</Badge>}
                  </>
                }
                meta={[
                  (user.nis || user.nip) && {
                    icon: Contact,
                    content: user.nis ? `NIS ${user.nis}` : `NIP ${user.nip}`,
                  },
                  user.role === ROLES.STUDENT && {
                    icon: School,
                    content: user.classroom_name ?? (
                      <span className="font-medium text-amber-700">Belum punya kelas</span>
                    ),
                  },
                  user.email && { icon: Mail, content: user.email },
                  user.schools.length > 1 && {
                    icon: Building2,
                    content: `Juga di: ${user.schools
                      .filter((s) => s.id !== school?.id)
                      .map((s) => s.name)
                      .join(', ')}`,
                  },
                ]}
                actions={
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialog({ type: 'form', user })}
                    >
                      <Pencil className="size-4" aria-hidden="true" /> Ubah
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialog({ type: 'reset', user })}
                    >
                      <KeyRound className="size-4" aria-hidden="true" /> Reset Password
                    </Button>
                    {user.id !== currentUser.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => setDialog({ type: 'delete', user })}
                        aria-label={`Hapus ${user.full_name}`}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    )}
                  </>
                }
              />
            ))}
          </CardGrid>
        )}

        <div className="mt-4">
          <Pagination page={page} count={users.data?.count ?? 0} onChange={setPage} />
        </div>

        {/* Bilah aksi mode pilih: menempel di bawah layar selama memilih. */}
        {selecting && (
          <div className="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-lg ring-1 ring-slate-200">
            <p className="mr-auto text-sm text-slate-700">
              <strong className="text-slate-900">{selectedCount}</strong> pengguna dipilih
            </p>
            <Button variant="ghost" size="sm" onClick={selectPage} disabled={!selectable.length}>
              Pilih semua di halaman ini
            </Button>
            {selectedCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelected({})}>
                Kosongkan
              </Button>
            )}
            <Button
              size="sm"
              disabled={!selectedCount}
              onClick={() => setDialog({ type: 'cards', users: Object.values(selected) })}
            >
              <IdCard className="size-4" aria-hidden="true" /> Cetak Kartu ({selectedCount})
            </Button>
          </div>
        )}
      </SplitExplorer>

      {dialog?.type === 'form' && (
        <UserFormModal
          key={dialog.user?.id ?? 'new'}
          user={dialog.user}
          onClose={closeDialog}
          onSaved={handleSaved}
        />
      )}
      {dialog?.type === 'import' && (
        <ImportUsersModal
          onClose={closeDialog}
          onImported={(count) => {
            // Modal tetap terbuka agar admin sempat mengunduh daftar password.
            setNotice(`${count} pengguna berhasil diimpor dari Excel.`)
            users.reload()
            reloadCounts()
            classrooms.reload()
          }}
        />
      )}
      {dialog?.type === 'update' && (
        <UpdateUsersModal
          onClose={closeDialog}
          onUpdated={(count) => {
            closeDialog()
            setNotice(`Data ${count} akun diperbarui dari Excel.`)
            users.reload()
          }}
        />
      )}
      {dialog?.type === 'join' && (
        <JoinUserModal
          onClose={closeDialog}
          onJoined={(joined) => {
            closeDialog()
            setNotice(`${joined.full_name} sekarang terdaftar di sekolah ini.`)
            users.reload()
            reloadCounts()
          }}
        />
      )}
      {dialog?.type === 'cards' && (
        <AccountCardsModal users={dialog.users} onClose={closeDialog} onDone={setNotice} />
      )}
      {dialog?.type === 'reset' && (
        <ResetPasswordModal
          user={dialog.user}
          onClose={closeDialog}
          onDone={(message) => {
            closeDialog()
            setNotice(message)
          }}
        />
      )}
      <DeleteDialog
        item={dialog?.type === 'delete' ? dialog.user : null}
        title="Hapus Pengguna"
        message={(user) =>
          user.schools.length > 1
            ? `Keluarkan ${user.full_name} dari sekolah ini? Akunnya tetap ada di sekolah lain.`
            : `Hapus akun ${user.full_name}? Tindakan ini tidak bisa dibatalkan. Untuk sementara melarang login, lebih baik nonaktifkan akun lewat menu Ubah.`
        }
        onDelete={(user) => usersApi.remove(user.id)}
        onDeleted={handleDeleted}
        onClose={closeDialog}
      />
    </>
  )
}
