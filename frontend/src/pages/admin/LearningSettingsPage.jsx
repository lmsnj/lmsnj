import { History, Printer, RotateCcw, Save, ToggleLeft, ToggleRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { classroomsApi, subjectsApi } from '../../api/academics'
import { schoolSettingsApi, subjectCategoriesApi } from '../../api/schoolSettings'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import DataTable from '../../components/DataTable'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import SelectField from '../../components/SelectField'
import SettingEditor from '../../components/settings/SettingEditor'
import Spinner from '../../components/Spinner'
import useAuth from '../../hooks/useAuth'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'
import { useSchoolSettings } from '../../hooks/useSetting'
import { useTabs } from '../../hooks/useTabs'
import { ALL, toOptions } from '../../utils/academic'
import { ROLES } from '../../utils/constants'
import { getErrorMessage } from '../../utils/errors'
import { formatDate } from '../../utils/media'
import GradeTypesPanel from './GradeTypesPanel'
import SubjectCategoriesPanel from './SubjectCategoriesPanel'
import {
  formatHistoryValue,
  formatSettingValue,
  sameValue,
  sourceLabel,
} from '../../utils/settings'

const SCOPE_OPTIONS = [
  { value: 'school', label: 'Seluruh sekolah' },
  { value: 'category', label: 'Kategori mapel tertentu' },
  { value: 'subject', label: 'Mata pelajaran tertentu' },
  { value: 'classroom', label: 'Kelas tertentu' },
]
// Label pilihan data per cakupan.
const TARGET_LABELS = {
  category: { label: 'Kategori mapel', noun: 'kategori mapel', placeholder: 'Pilih kategori' },
  subject: { label: 'Mata pelajaran', noun: 'mata pelajaran', placeholder: 'Pilih mapel' },
  classroom: { label: 'Kelas', noun: 'kelas', placeholder: 'Pilih kelas' },
}

// Cakupan mapel/kelas yang belum dipilih tidak perlu dimuat.
const loadSettings = (target) =>
  target.scope !== 'school' && !target.scopeId
    ? Promise.resolve(null)
    : schoolSettingsApi.list(target)

function Loading() {
  return (
    <div className="py-10 text-center text-brand-600">
      <Spinner />
    </div>
  )
}

// Satu pengaturan: isian, nilai bawaan, asal nilai yang berlaku, Simpan & Kembalikan ke default.
function SettingCard({ setting, target, onChanged }) {
  const current = setting.stored ?? setting.effective
  const [draft, setDraft] = useState(current)
  const save = useFormSubmit(async () => {
    await schoolSettingsApi.save(setting.key, target, draft)
    onChanged(`${setting.label} disimpan.`)
  })
  const reset = useFormSubmit(async () => {
    await schoolSettingsApi.reset(setting.key, target)
    onChanged(`${setting.label} dikembalikan ke default.`)
  })
  const submitting = save.submitting || reset.submitting
  const dirty = !sameValue(draft, current)
  const errorOf = ({ errors, generalError }) =>
    errors.value || errors.scope || errors.scope_id || generalError
  const error = errorOf(save) || errorOf(reset)

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">{setting.label}</h3>
          {setting.help && <p className="mt-0.5 text-sm text-slate-500">{setting.help}</p>}
        </div>
        <Badge color={setting.source === target.scope ? 'green' : 'gray'}>
          {sourceLabel(setting.source, target.scope)}
        </Badge>
      </div>
      <SettingEditor setting={setting} value={draft} onChange={setDraft} disabled={submitting} />
      <Alert type="error" className="mt-3">
        {error}
      </Alert>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-500">
          Default:{' '}
          <span className="font-medium text-slate-700">
            {formatSettingValue(setting, setting.default)}
          </span>
          {target.scope !== 'school' && setting.stored === null && (
            <>
              {' '}
              · Berlaku sekarang:{' '}
              <span className="font-medium text-slate-700">
                {formatSettingValue(setting, setting.effective)}
              </span>
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={setting.stored === null || submitting}
            loading={reset.submitting}
            onClick={reset.submit}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Kembalikan ke default
          </Button>
          <Button
            size="sm"
            disabled={!dirty || submitting}
            loading={save.submitting}
            onClick={save.submit}
          >
            <Save className="size-3.5" aria-hidden="true" />
            Simpan
          </Button>
        </div>
      </div>
    </div>
  )
}

// Saklar fitur baru. Semua admin bisa melihat; hanya Super Admin yang bisa mengubah.
function FeaturesPanel({ canToggle, onChanged }) {
  const features = useFetch(schoolSettingsApi.features)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const toggle = async (feature) => {
    setBusy(feature.code)
    setError('')
    try {
      await schoolSettingsApi.setFeature(feature.code, !feature.is_active)
      features.reload()
      onChanged(`${feature.label} ${feature.is_active ? 'dimatikan' : 'dinyalakan'}.`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy('')
    }
  }

  if (features.error) return <Alert type="error">{features.error}</Alert>
  if (!features.data) return <Loading />
  return (
    <div className="space-y-3">
      <Alert type="info">
        Fitur baru bawaannya mati. Selama mati, LMS bekerja persis seperti sebelumnya.
        {!canToggle && ' Hanya Super Admin yang dapat menyalakan atau mematikan fitur.'}
      </Alert>
      <Alert type="error">{error}</Alert>
      {features.data.map((feature) => (
        <div
          key={feature.code}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
        >
          <div>
            <h3 className="font-semibold text-slate-900">{feature.label}</h3>
            <p className="text-sm text-slate-500">{feature.help}</p>
          </div>
          {canToggle ? (
            <Button
              variant={feature.is_active ? 'primary' : 'secondary'}
              loading={busy === feature.code}
              disabled={Boolean(busy)}
              onClick={() => toggle(feature)}
              aria-pressed={feature.is_active}
            >
              {feature.is_active ? (
                <ToggleRight className="size-5" aria-hidden="true" />
              ) : (
                <ToggleLeft className="size-5" aria-hidden="true" />
              )}
              {feature.is_active ? 'Aktif' : 'Mati'}
            </Button>
          ) : (
            <Badge color={feature.is_active ? 'green' : 'gray'}>
              {feature.is_active ? 'Aktif' : 'Mati'}
            </Badge>
          )}
        </div>
      ))}
    </div>
  )
}

// Riwayat perubahan + "Pakai nilai lama" untuk mengembalikan perubahan.
function HistoryPanel({ onChanged }) {
  const [page, setPage] = useState(1)
  const history = useFetch(schoolSettingsApi.history, { page })
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const restore = async (row) => {
    setBusy(row.id)
    setError('')
    const target = { scope: row.scope, scopeId: row.scope_id }
    try {
      if (row.old_value === null) await schoolSettingsApi.reset(row.key, target)
      else await schoolSettingsApi.save(row.key, target, row.old_value)
      history.reload()
      onChanged(`${row.label} dikembalikan ke nilai sebelumnya.`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const columns = [
    {
      header: 'Waktu',
      cell: (row) => <span className="whitespace-nowrap">{formatDate(row.changed_at)}</span>,
    },
    {
      header: 'Pengaturan',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.label}</p>
          <p className="text-xs text-slate-500">{row.target}</p>
        </div>
      ),
    },
    { header: 'Nilai lama', cell: (row) => formatHistoryValue(row.old_value) },
    { header: 'Nilai baru', cell: (row) => formatHistoryValue(row.new_value) },
    { header: 'Oleh', cell: (row) => row.changed_by_name ?? '-' },
    {
      header: '',
      cell: (row) =>
        !row.key.startsWith('fitur.') && (
          <Button
            size="sm"
            variant="ghost"
            loading={busy === row.id}
            disabled={busy !== null}
            onClick={() => restore(row)}
          >
            <History className="size-3.5" aria-hidden="true" />
            Pakai nilai lama
          </Button>
        ),
    },
  ]

  if (history.error) return <Alert type="error">{history.error}</Alert>
  return (
    <div className="space-y-3">
      <Alert type="error">{error}</Alert>
      <DataTable
        columns={columns}
        rows={history.data?.results ?? []}
        loading={history.loading}
        emptyMessage="Belum ada perubahan pengaturan."
      />
      <Pagination page={page} count={history.data?.count ?? 0} onChange={setPage} />
    </div>
  )
}

export default function LearningSettingsPage() {
  const { user } = useAuth()
  const settingsContext = useSchoolSettings()
  const [target, setTarget] = useState({ scope: 'school', scopeId: null })
  const [message, setMessage] = useState('')
  const list = useFetch(loadSettings, target)
  const subjects = useFetch(subjectsApi.list, ALL)
  const classrooms = useFetch(classroomsApi.list, ALL)
  const categories = useFetch(subjectCategoriesApi.list)

  // Daftar tab diingat dari muatan terakhir: saat cakupan diganti (mapel/kelas belum dipilih)
  // tab tidak boleh hilang, agar tab yang sedang dibuka tetap sama.
  const [groups, setGroups] = useState([])
  if (list.data && list.data.groups !== groups) setGroups(list.data.groups)
  const [tab, tabsBar] = useTabs([
    ...groups.map((group) => ({ id: group.id, label: group.label })),
    { id: 'fitur', label: 'Fitur' },
    { id: 'riwayat', label: 'Riwayat' },
  ])

  // Perubahan langsung berlaku: daftar dimuat ulang dan nilai di seluruh aplikasi diperbarui.
  const changed = (text) => {
    setMessage(text)
    list.reload()
    categories.reload()
    settingsContext.reload()
  }
  const targetLabels = TARGET_LABELS[target.scope]
  const targetOptions = {
    category: () => toOptions(categories.data, (c) => c.name, targetLabels.placeholder),
    subject: () =>
      toOptions(subjects.data?.results, (s) => `${s.name} (${s.code})`, targetLabels.placeholder),
    classroom: () =>
      toOptions(
        classrooms.data?.results,
        (c) => `${c.name} · ${c.academic_year}`,
        targetLabels.placeholder,
      ),
  }[target.scope]?.()

  const groupSettings = (list.data?.settings ?? []).filter((setting) => setting.group === tab)
  let content
  if (tab === 'fitur') {
    content = <FeaturesPanel canToggle={user.role === ROLES.FOUNDATION} onChanged={changed} />
  } else if (tab === 'riwayat') {
    content = <HistoryPanel onChanged={changed} />
  } else if (list.error) {
    content = <Alert type="error">{list.error}</Alert>
  } else if (target.scope !== 'school' && !target.scopeId) {
    content = (
      <EmptyState title="Pilih data terlebih dahulu">
        Pilih {targetLabels.noun} yang akan diatur.
      </EmptyState>
    )
  } else if (!list.data) {
    content = <Loading />
  } else if (groupSettings.length === 0 && tab !== 'kategori') {
    content = (
      <EmptyState title="Tidak ada pengaturan di bagian ini">
        Pengaturan bagian ini hanya bisa diatur untuk seluruh sekolah.
      </EmptyState>
    )
  } else {
    content = (
      <div className="space-y-4">
        {groupSettings.map((setting) => (
          <SettingCard
            // key ikut nilai tersimpan: isian kembali ke nilai terbaru setelah disimpan/dikembalikan.
            key={`${target.scope}-${target.scopeId}-${setting.key}-${JSON.stringify(setting.stored)}`}
            setting={setting}
            target={target}
            onChanged={changed}
          />
        ))}
        {/* Jenis penilaian (Tahap 3) diatur dari cakupan sekolah. */}
        {tab === 'penilaian' && target.scope === 'school' && (
          <GradeTypesPanel onChanged={changed} />
        )}
        {/* Set kartu Kuis QR (Tahap 5) dicetak sekali untuk sekolah, ukuran & jumlah dari pengaturan di atas. */}
        {tab === 'kuis_qr' && target.scope === 'school' && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-600">
              Cetak set kartu QR, laminating, lalu simpan di kelas. Guru memetakan kartu ke siswa
              dari halaman Kuis QR kelasnya.
            </p>
            <Link
              to="/cetak/kartu-qr"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Printer className="size-4" aria-hidden="true" /> Cetak Kartu QR
            </Link>
          </div>
        )}
        {/* Kategori & mode tiap mapel hanya diatur dari cakupan sekolah (Tahap 2). */}
        {tab === 'kategori' && target.scope === 'school' && (
          <SubjectCategoriesPanel
            canEditModes={user.role === ROLES.FOUNDATION}
            onChanged={changed}
          />
        )}
      </div>
    )
  }

  const showScope = tab !== 'fitur' && tab !== 'riwayat'
  return (
    <div>
      <PageHeader
        title="Pengaturan Pembelajaran"
        description="Aturan penilaian, kuis, LKPD, dan fitur baru sekolah ini. Perubahan langsung berlaku dan tercatat di Riwayat."
      />
      {tabsBar}
      {showScope && (
        <div className="mb-4 grid gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-2">
          <SelectField
            label="Berlaku untuk"
            options={SCOPE_OPTIONS}
            value={target.scope}
            onChange={(event) => setTarget({ scope: event.target.value, scopeId: null })}
            hint="Pengaturan yang lebih khusus menimpa yang umum. Urutan: kelas → mapel → kategori → sekolah → default."
          />
          {target.scope !== 'school' && (
            <SelectField
              label={targetLabels.label}
              options={targetOptions}
              value={target.scopeId ?? ''}
              onChange={(event) =>
                setTarget({
                  ...target,
                  scopeId: event.target.value ? Number(event.target.value) : null,
                })
              }
            />
          )}
        </div>
      )}
      <Alert type="success" className="mb-4">
        {message}
      </Alert>
      {content}
    </div>
  )
}
