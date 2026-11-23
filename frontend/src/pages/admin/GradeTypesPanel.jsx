import { ArrowDown, ArrowUp, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { gradeTypesApi } from '../../api/grading'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import DeleteDialog from '../../components/DeleteDialog'
import Spinner from '../../components/Spinner'
import { inputClass } from '../../components/TextField'
import useFetch from '../../hooks/useFetch'
import { getErrorMessage } from '../../utils/errors'
import { moveId, sameValue } from '../../utils/settings'

// Master jenis penilaian (Mapel Umum Tahap 3) di tab Penilaian Pengaturan Pembelajaran.

const fieldClass = `${inputClass} ring-slate-300`
const GROUPS = [
  { value: 'formatif', label: 'Formatif' },
  { value: 'sumatif', label: 'Sumatif' },
]

function GroupSelect({ value, onChange, label }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={fieldClass}
    >
      {GROUPS.map((group) => (
        <option key={group.value} value={group.value}>
          {group.label}
        </option>
      ))}
    </select>
  )
}

function TypeRow({ type, first, last, onMove, onDelete, onChanged }) {
  const initial = {
    name: type.name,
    group: type.group,
    default_weight: type.default_weight,
    is_active: type.is_active,
  }
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await gradeTypesApi.update(type.id, draft)
      onChanged(`Jenis ${draft.name} disimpan.`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  return (
    <li className="rounded-lg p-3 ring-1 ring-slate-200">
      <div className="grid items-center gap-2 sm:grid-cols-[1fr_9rem_7rem_auto]">
        <input
          aria-label="Nama jenis penilaian"
          value={draft.name}
          maxLength={60}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className={fieldClass}
        />
        <GroupSelect
          label={`Kelompok ${type.name}`}
          value={draft.group}
          onChange={(group) => setDraft({ ...draft, group })}
        />
        <label className="flex items-center gap-1 text-sm text-slate-500">
          <input
            type="number"
            min={0}
            max={100}
            aria-label={`Bobot bawaan ${type.name}`}
            value={draft.default_weight}
            onChange={(e) =>
              setDraft({
                ...draft,
                default_weight: e.target.value === '' ? '' : Number(e.target.value),
              })
            }
            className={fieldClass}
          />
          %
        </label>
        <div className="flex flex-wrap items-center gap-1">
          <label className="mr-2 inline-flex items-center gap-1.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
              className="size-4 rounded border-slate-300 text-brand-600"
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
          <Button size="sm" variant="ghost" onClick={onDelete} aria-label={`Hapus ${type.name}`}>
            <Trash2 className="size-4 text-red-600" />
          </Button>
          <Button size="sm" disabled={sameValue(draft, initial)} loading={saving} onClick={save}>
            <Save className="size-3.5" aria-hidden="true" />
            Simpan
          </Button>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">Dipakai di {type.activity_count} penilaian</p>
      <Alert type="error" className="mt-2">
        {error}
      </Alert>
    </li>
  )
}

export default function GradeTypesPanel({ onChanged }) {
  const types = useFetch(gradeTypesApi.list)
  const [form, setForm] = useState({ name: '', group: 'formatif' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(null)

  const run = async (action, text) => {
    setBusy(true)
    setError('')
    try {
      await action()
      types.reload()
      onChanged(text)
      return true
    } catch (err) {
      setError(getErrorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }
  const changed = (text) => {
    types.reload()
    onChanged(text)
  }

  if (types.error) return <Alert type="error">{types.error}</Alert>
  if (!types.data) {
    return (
      <div className="py-6 text-center text-brand-600">
        <Spinner />
      </div>
    )
  }
  const list = types.data
  return (
    <section className="mt-6 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
      <h2 className="font-semibold text-slate-900">Jenis penilaian</h2>
      <p className="mt-0.5 mb-4 text-sm text-slate-500">
        Dipakai guru di Penilaian Langsung. Jenis yang sudah dipakai tidak bisa dihapus; nonaktifkan
        saja. Bobot bawaan dipakai laporan nilai terpadu.
      </p>
      {list.length === 0 ? (
        <div className="mb-4 rounded-lg bg-slate-50 p-4 text-center">
          <p className="text-sm text-slate-600">Belum ada jenis penilaian.</p>
          <Button
            className="mt-3"
            loading={busy}
            onClick={() => run(() => gradeTypesApi.starter(), 'Jenis penilaian awal dibuat.')}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            Buat jenis awal (Tugas Kertas, Lisan, Sikap, …)
          </Button>
        </div>
      ) : (
        <ul className="mb-4 space-y-2">
          {list.map((type, index) => (
            <TypeRow
              key={`${type.id}-${type.name}-${type.group}-${type.default_weight}-${type.is_active}`}
              type={type}
              first={index === 0}
              last={index === list.length - 1}
              onMove={(step) =>
                run(
                  () =>
                    gradeTypesApi.reorder(
                      moveId(
                        list.map((t) => t.id),
                        type.id,
                        step,
                      ),
                    ),
                  'Urutan jenis penilaian disimpan.',
                )
              }
              onDelete={() => setDeleting(type)}
              onChanged={changed}
            />
          ))}
        </ul>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (await run(() => gradeTypesApi.create(form), `Jenis ${form.name} ditambahkan.`)) {
            setForm({ name: '', group: 'formatif' })
          }
        }}
        className="grid gap-2 sm:grid-cols-[1fr_9rem_auto]"
      >
        <input
          aria-label="Nama jenis penilaian baru"
          placeholder="Nama jenis baru, mis. Proyek"
          value={form.name}
          maxLength={60}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={fieldClass}
        />
        <GroupSelect
          label="Kelompok jenis baru"
          value={form.group}
          onChange={(group) => setForm({ ...form, group })}
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
        title="Hapus jenis penilaian"
        message={deleting && `Hapus jenis "${deleting.name}"?`}
        onDelete={(item) => gradeTypesApi.remove(item.id)}
        onDeleted={(item) => {
          setDeleting(null)
          changed(`Jenis ${item.name} dihapus.`)
        }}
        onClose={() => setDeleting(null)}
      />
    </section>
  )
}
