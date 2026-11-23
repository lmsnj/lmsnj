import { ArrowDown, ArrowUp, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { classModesApi, subjectCategoriesApi, subjectProfilesApi } from '../../api/schoolSettings'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import DeleteDialog from '../../components/DeleteDialog'
import EmptyState from '../../components/EmptyState'
import Spinner from '../../components/Spinner'
import { inputClass } from '../../components/TextField'
import useFetch from '../../hooks/useFetch'
import { getErrorMessage } from '../../utils/errors'
import { countSubjectsByCategory, filterSubjectRows, moveId, sameValue } from '../../utils/settings'

// Tab "Kategori Mapel" (Mapel Umum Tahap 2): kategori mapel, kategori & mode tiap mapel, master mode kelas.
// Mode bawaan kategori/mapel disimpan sebagai pengaturan kelas.mode_default di cakupan itu (backend).

const fieldClass = `${inputClass} ring-slate-300`

// Kategori awal yang disarankan spesifikasi untuk SMK (bisa diganti nama/dihapus setelah dibuat).
const STARTER_CATEGORIES = [
  { name: 'Umum', mode: 'tanpa_perangkat' },
  { name: 'Produktif', mode: 'lab' },
]

function Section({ title, description, children }) {
  return (
    <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-0.5 mb-4 text-sm text-slate-500">{description}</p>}
      {children}
    </section>
  )
}

function ModeSelect({ modes, value, onChange, emptyLabel, disabled, label }) {
  return (
    <select
      aria-label={label}
      value={value ?? ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
      className={fieldClass}
    >
      <option value="">{emptyLabel}</option>
      {modes.map((mode) => (
        <option key={mode.code} value={mode.code} disabled={!mode.is_active}>
          {mode.name}
          {!mode.is_active ? ' (nonaktif)' : ''}
        </option>
      ))}
    </select>
  )
}

// Satu baris kategori: nama, mode bawaan, aktif, urutan, hapus.
function CategoryRow({ category, modes, first, last, onMove, onDelete, onChanged }) {
  const initial = { name: category.name, mode: category.mode, is_active: category.is_active }
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await subjectCategoriesApi.update(category.id, draft)
      onChanged(`Kategori ${draft.name} disimpan.`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="rounded-lg p-3 ring-1 ring-slate-200">
      <div className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          aria-label="Nama kategori"
          value={draft.name}
          maxLength={60}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          className={fieldClass}
        />
        <ModeSelect
          label={`Mode bawaan ${category.name}`}
          modes={modes}
          value={draft.mode}
          emptyLabel="Mode: ikut pengaturan sekolah"
          onChange={(mode) => setDraft({ ...draft, mode })}
        />
        <div className="flex flex-wrap items-center gap-1">
          <label className="mr-2 inline-flex items-center gap-1.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })}
              className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            Aktif
          </label>
          <Button
            size="sm"
            variant="ghost"
            disabled={first}
            onClick={() => onMove(-1)}
            aria-label="Naikkan"
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={last}
            onClick={() => onMove(1)}
            aria-label="Turunkan"
          >
            <ArrowDown className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            aria-label={`Hapus ${category.name}`}
          >
            <Trash2 className="size-4 text-red-600" />
          </Button>
          <Button size="sm" disabled={sameValue(draft, initial)} loading={saving} onClick={save}>
            <Save className="size-3.5" aria-hidden="true" />
            Simpan
          </Button>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">{category.subject_count} mapel</p>
      <Alert type="error" className="mt-2">
        {error}
      </Alert>
    </li>
  )
}

function CategoriesManager({ categories, modes, onChanged }) {
  const [form, setForm] = useState({ name: '', mode: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(null)

  const run = async (action, text) => {
    setBusy(true)
    setError('')
    try {
      await action()
      onChanged(text)
      return true
    } catch (err) {
      setError(getErrorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }
  const add = async (event) => {
    event.preventDefault()
    const ok = await run(
      () => subjectCategoriesApi.create(form),
      `Kategori ${form.name} ditambahkan.`,
    )
    if (ok) setForm({ name: '', mode: null })
  }
  const createStarters = () =>
    run(async () => {
      for (const category of STARTER_CATEGORIES) await subjectCategoriesApi.create(category)
    }, 'Kategori Umum dan Produktif dibuat.')
  const move = (id, step) => {
    const ids = moveId(
      categories.map((c) => c.id),
      id,
      step,
    )
    run(() => subjectCategoriesApi.reorder(ids), 'Urutan kategori disimpan.')
  }

  return (
    <Section
      title="Kategori mapel"
      description="Kelompok mapel beserta mode kelas bawaannya. Kategori yang masih dipakai mapel tidak bisa dihapus; nonaktifkan saja."
    >
      {categories.length === 0 ? (
        <div className="mb-4 rounded-lg bg-slate-50 p-4 text-center">
          <p className="text-sm text-slate-600">Belum ada kategori mapel.</p>
          <Button className="mt-3" loading={busy} onClick={createStarters}>
            <Sparkles className="size-4" aria-hidden="true" />
            Buat kategori awal (Umum, Produktif)
          </Button>
        </div>
      ) : (
        <ul className="mb-4 space-y-2">
          {categories.map((category, index) => (
            <CategoryRow
              // key ikut data: baris kembali ke nilai terbaru setelah disimpan.
              key={`${category.id}-${category.name}-${category.mode}-${category.is_active}`}
              category={category}
              modes={modes}
              first={index === 0}
              last={index === categories.length - 1}
              onMove={(step) => move(category.id, step)}
              onDelete={() => setDeleting(category)}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          aria-label="Nama kategori baru"
          placeholder="Nama kategori baru, mis. Muatan Lokal"
          value={form.name}
          maxLength={60}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          className={fieldClass}
        />
        <ModeSelect
          label="Mode bawaan kategori baru"
          modes={modes}
          value={form.mode}
          emptyLabel="Mode: ikut pengaturan sekolah"
          onChange={(mode) => setForm({ ...form, mode })}
        />
        <Button type="submit" variant="secondary" loading={busy} disabled={!form.name.trim()}>
          <Plus className="size-4" aria-hidden="true" />
          Tambah
        </Button>
      </form>
      <Alert type="error" className="mt-3">
        {error}
      </Alert>
      <DeleteDialog
        item={deleting}
        title="Hapus kategori"
        message={deleting && `Hapus kategori "${deleting.name}"?`}
        onDelete={(item) => subjectCategoriesApi.remove(item.id)}
        onDeleted={(item) => {
          setDeleting(null)
          onChanged(`Kategori ${item.name} dihapus.`)
        }}
        onClose={() => setDeleting(null)}
      />
    </Section>
  )
}

// Kategori & mode setiap mapel. Pilihan di baris langsung disimpan; centang beberapa untuk isi massal.
function SubjectAssignments({ categories, modes, onChanged }) {
  const profiles = useFetch(subjectProfilesApi.list)
  const [filters, setFilters] = useState({ search: '', category: '' })
  const [selected, setSelected] = useState([])
  const [bulkCategory, setBulkCategory] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (action, text) => {
    setBusy(true)
    setError('')
    try {
      await action()
      profiles.reload()
      onChanged(text)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (profiles.error) return <Alert type="error">{profiles.error}</Alert>
  if (!profiles.data) {
    return (
      <div className="py-6 text-center text-brand-600">
        <Spinner />
      </div>
    )
  }
  const rows = profiles.data
  const visible = filterSubjectRows(rows, filters)
  const counts = countSubjectsByCategory(rows)
  const modeName = (code) => modes.find((mode) => mode.code === code)?.name ?? code
  const activeCategories = categories.filter((c) => c.is_active)
  const allVisibleSelected =
    visible.length > 0 && visible.every((r) => selected.includes(r.subject))
  const chips = [
    { value: '', label: `Semua (${rows.length})` },
    ...categories.map((c) => ({ value: String(c.id), label: `${c.name} (${counts[c.id] ?? 0})` })),
    { value: 'none', label: `Belum berkategori (${counts.none})` },
  ]
  const toggle = (id) =>
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  const bulkAssign = () =>
    run(async () => {
      await subjectProfilesApi.bulk(selected, {
        category: bulkCategory === 'none' ? null : Number(bulkCategory),
      })
      setSelected([])
    }, `Kategori ${selected.length} mapel diperbarui.`)

  return (
    <Section
      title="Kategori & mode tiap mapel"
      description="Mode mapel menimpa mode kategorinya. Mode per kelas diatur lewat pilihan Berlaku untuk › Kelas tertentu di atas."
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            aria-pressed={filters.category === chip.value}
            onClick={() => setFilters({ ...filters, category: chip.value })}
            className={`rounded-full px-3 py-1 text-sm ring-1 ${
              filters.category === chip.value
                ? 'bg-brand-600 text-white ring-brand-600'
                : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
            } ${chip.value === 'none' && counts.none > 0 && filters.category !== 'none' ? 'font-semibold text-amber-700' : ''}`}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <input
        type="search"
        aria-label="Cari mapel"
        placeholder="Cari nama atau kode mapel"
        value={filters.search}
        onChange={(event) => setFilters({ ...filters, search: event.target.value })}
        className={`${fieldClass} mb-3`}
      />
      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 p-3 ring-1 ring-brand-100">
          <span className="text-sm font-medium text-brand-800">
            {selected.length} mapel dipilih
          </span>
          <select
            aria-label="Kategori untuk mapel terpilih"
            value={bulkCategory}
            onChange={(event) => setBulkCategory(event.target.value)}
            className={`${fieldClass} max-w-56`}
          >
            <option value="">Pilih kategori</option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="none">Tanpa kategori</option>
          </select>
          <Button size="sm" disabled={!bulkCategory} loading={busy} onClick={bulkAssign}>
            Tetapkan
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Batal
          </Button>
        </div>
      )}
      <Alert type="error" className="mb-3">
        {error}
      </Alert>
      {rows.length === 0 ? (
        <EmptyState title="Belum ada mata pelajaran">
          Tambahkan mapel di menu Mata Pelajaran.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
                <th className="w-10 py-2">
                  <input
                    type="checkbox"
                    aria-label="Pilih semua mapel yang tampil"
                    checked={allVisibleSelected}
                    onChange={() =>
                      setSelected(
                        allVisibleSelected
                          ? selected.filter((id) => !visible.some((r) => r.subject === id))
                          : [...new Set([...selected, ...visible.map((r) => r.subject)])],
                      )
                    }
                    className="size-4 rounded border-slate-300 text-brand-600"
                  />
                </th>
                <th className="py-2">Mapel</th>
                <th className="py-2">Kategori</th>
                <th className="py-2">Mode mapel</th>
                <th className="py-2">Berlaku</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.subject} className="border-b border-slate-100">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      aria-label={`Pilih ${row.name}`}
                      checked={selected.includes(row.subject)}
                      onChange={() => toggle(row.subject)}
                      className="size-4 rounded border-slate-300 text-brand-600"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <p className="font-medium text-slate-900">{row.name}</p>
                    <p className="text-xs text-slate-500">{row.code}</p>
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      aria-label={`Kategori ${row.name}`}
                      value={row.category ?? ''}
                      disabled={busy}
                      onChange={(event) =>
                        run(
                          () =>
                            subjectProfilesApi.update(row.subject, {
                              category: event.target.value ? Number(event.target.value) : null,
                            }),
                          `Kategori ${row.name} disimpan.`,
                        )
                      }
                      className={fieldClass}
                    >
                      <option value="">Tanpa kategori</option>
                      {categories.map((c) => (
                        <option
                          key={c.id}
                          value={c.id}
                          disabled={!c.is_active && c.id !== row.category}
                        >
                          {c.name}
                          {!c.is_active ? ' (nonaktif)' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <ModeSelect
                      label={`Mode ${row.name}`}
                      modes={modes}
                      value={row.mode}
                      disabled={busy}
                      emptyLabel="Ikut kategori/sekolah"
                      onChange={(mode) =>
                        run(
                          () => subjectProfilesApi.update(row.subject, { mode }),
                          `Mode ${row.name} disimpan.`,
                        )
                      }
                    />
                  </td>
                  <td className="py-2">
                    <Badge color={row.effective_mode === 'tanpa_perangkat' ? 'amber' : 'gray'}>
                      {modeName(row.effective_mode)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">Tidak ada mapel yang cocok.</p>
          )}
        </div>
      )}
    </Section>
  )
}

// Master mode kelas (semua sekolah). Hanya Super Admin yang bisa mengubah.
function ModeRow({ mode, canEdit, onChanged }) {
  const initial = {
    name: mode.name,
    needs_student_device: mode.needs_student_device,
    is_active: mode.is_active,
  }
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await classModesApi.update(mode.id, draft)
      onChanged(`Mode ${draft.name} disimpan.`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  if (!canEdit) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg p-3 ring-1 ring-slate-200">
        <span className="font-medium text-slate-900">{mode.name}</span>
        <span className="flex gap-2">
          <Badge color={mode.needs_student_device ? 'blue' : 'amber'}>
            {mode.needs_student_device ? 'Siswa memakai perangkat' : 'Tanpa perangkat siswa'}
          </Badge>
          {!mode.is_active && <Badge>Nonaktif</Badge>}
        </span>
      </li>
    )
  }
  return (
    <li className="rounded-lg p-3 ring-1 ring-slate-200">
      <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input
          aria-label={`Nama mode ${mode.code}`}
          value={draft.name}
          maxLength={60}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          className={fieldClass}
        />
        <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={draft.needs_student_device}
            onChange={(event) => setDraft({ ...draft, needs_student_device: event.target.checked })}
            className="size-4 rounded border-slate-300 text-brand-600"
          />
          Siswa memakai perangkat
        </label>
        <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })}
            className="size-4 rounded border-slate-300 text-brand-600"
          />
          Aktif
        </label>
        <Button size="sm" disabled={sameValue(draft, initial)} loading={saving} onClick={save}>
          <Save className="size-3.5" aria-hidden="true" />
          Simpan
        </Button>
      </div>
      <p className="mt-1 text-xs text-slate-500">Kode: {mode.code}</p>
      <Alert type="error" className="mt-2">
        {error}
      </Alert>
    </li>
  )
}

export default function SubjectCategoriesPanel({ canEditModes, onChanged }) {
  const categories = useFetch(subjectCategoriesApi.list)
  const modes = useFetch(classModesApi.list)
  const [version, setVersion] = useState(0)
  // Setiap perubahan memuat ulang kategori (jumlah mapel) dan daftar mapel (mode berlaku).
  const changed = (text) => {
    categories.reload()
    modes.reload()
    setVersion((v) => v + 1)
    onChanged(text)
  }

  const error = categories.error || modes.error
  if (error) return <Alert type="error">{error}</Alert>
  if (!categories.data || !modes.data) {
    return (
      <div className="py-6 text-center text-brand-600">
        <Spinner />
      </div>
    )
  }
  return (
    <div className="mt-6 space-y-4">
      <CategoriesManager categories={categories.data} modes={modes.data} onChanged={changed} />
      <SubjectAssignments
        key={version}
        categories={categories.data}
        modes={modes.data}
        onChanged={(text) => {
          categories.reload() // jumlah mapel per kategori
          onChanged(text)
        }}
      />
      <Section
        title="Mode kelas"
        description={
          canEditModes
            ? 'Berlaku untuk semua sekolah. Kode tidak bisa diubah; mode yang tidak dipakai cukup dinonaktifkan.'
            : 'Daftar mode kelas diatur Super Admin.'
        }
      >
        <ul className="space-y-2">
          {modes.data.map((mode) => (
            <ModeRow
              key={`${mode.id}-${mode.name}-${mode.is_active}-${mode.needs_student_device}`}
              mode={mode}
              canEdit={canEditModes}
              onChanged={changed}
            />
          ))}
        </ul>
      </Section>
    </div>
  )
}
