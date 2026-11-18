import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { learningMediaApi } from '../../api/learningMedia'
import Button from '../../components/Button'
import TextAreaField from '../../components/TextAreaField'
import TextField from '../../components/TextField'
import { getErrorMessage } from '../../utils/errors'
import { StepImage } from '../steps/ExplainSteps'
import { linesToList, listToLines, moveInList, removeFromList } from '../studio'

/** Teks banyak baris <-> daftar (satu butir per baris). */
export function LinesField({ label, value, onChange, hint, rows = 3, placeholder }) {
  // Teks disimpan sendiri agar baris kosong yang sedang diketik tidak langsung hilang.
  const [text, setText] = useState(() => listToLines(value))
  return (
    <TextAreaField
      label={label}
      value={text}
      rows={rows}
      hint={hint}
      placeholder={placeholder}
      onChange={(event) => {
        setText(event.target.value)
        onChange(linesToList(event.target.value))
      }}
    />
  )
}

export function NumberField({ label, value, onChange, min = 0, max = 100, hint }) {
  return (
    <TextField
      label={label}
      type="number"
      min={min}
      max={max}
      value={value ?? ''}
      hint={hint}
      onChange={(event) => onChange(event.target.value === '' ? 0 : Number(event.target.value))}
    />
  )
}

export function CheckField({ label, checked, onChange }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 rounded border-slate-300"
      />
      <span>{label}</span>
    </label>
  )
}

/**
 * Gambar: unggah (dikompres server, disimpan sebagai "asset:<id>") atau tempel alamat https.
 */
export function ImageField({ label = 'Gambar (opsional)', value, onChange, mediaId }) {
  const inputRef = useRef(null)
  const id = useId()
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const upload = async (file) => {
    if (!file) return
    setError('')
    setProgress(0)
    try {
      const asset = await learningMediaApi.uploadAsset(mediaId, file, setProgress)
      onChange(asset.ref)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }
  const isAsset = /^asset:/.test(value || '')
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {value && (
        <div className="relative inline-block rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
          <StepImage src={value} className="max-h-40" />
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Hapus gambar"
            className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-white text-slate-600 shadow ring-1 ring-slate-300"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          loading={progress !== null}
        >
          <ImagePlus className="size-4" aria-hidden="true" />
          {progress !== null ? `Mengunggah ${progress}%` : 'Unggah gambar'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => upload(event.target.files?.[0])}
        />
        <input
          id={id}
          type="url"
          value={isAsset ? '' : (value ?? '')}
          onChange={(event) => onChange(event.target.value)}
          placeholder={isAsset ? 'Gambar unggahan dipakai' : 'atau tempel alamat https://'}
          className="min-w-0 flex-1 rounded-lg border-0 px-3 py-1.5 text-base ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-brand-600 sm:text-sm"
        />
      </div>
      <p className="text-xs text-slate-500">
        PNG/JPG/GIF/WEBP maks. 10 MB, otomatis dikompres agar hemat kuota siswa.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

/**
 * Daftar objek yang bisa ditambah, dihapus, dan diurutkan. `renderItem(item, update)` menggambar isi
 * satu baris; `update(perubahan)` menggabungkan perubahan ke butir itu.
 */
export function ListEditor({
  label,
  items,
  onChange,
  renderItem,
  newItem,
  min = 0,
  max = 20,
  addLabel = 'Tambah',
}) {
  const update = (index, changes) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...changes } : item)))
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium text-slate-700">{label}</legend>
      {items.map((item, index) => (
        <div key={index} className="flex gap-2 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
          <span className="mt-2 w-5 shrink-0 text-center text-xs font-bold text-slate-400">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            {renderItem(item, (changes) => update(index, changes), index)}
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <IconButton
              label="Naikkan"
              icon={ArrowUp}
              disabled={index === 0}
              onClick={() => onChange(moveInList(items, index, -1))}
            />
            <IconButton
              label="Turunkan"
              icon={ArrowDown}
              disabled={index === items.length - 1}
              onClick={() => onChange(moveInList(items, index, 1))}
            />
            <IconButton
              label="Hapus"
              icon={Trash2}
              disabled={items.length <= min}
              onClick={() => onChange(removeFromList(items, index))}
            />
          </div>
        </div>
      ))}
      {items.length < max && (
        <Button variant="secondary" size="sm" onClick={() => onChange([...items, newItem()])}>
          <Plus className="size-4" aria-hidden="true" /> {addLabel}
        </Button>
      )}
    </fieldset>
  )
}

export function IconButton({ label, icon: Icon, onClick, disabled, tone = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex size-8 items-center justify-center rounded-md text-slate-600 ring-1 ring-slate-300 hover:bg-white disabled:opacity-30 ${tone}`}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  )
}

/** Input teks kecil tanpa label besar (dipakai di dalam baris daftar). */
export function SmallInput({ label, value, onChange, placeholder, className = '' }) {
  return (
    <input
      aria-label={label}
      value={value ?? ''}
      placeholder={placeholder ?? label}
      onChange={(event) => onChange(event.target.value)}
      className={`block w-full rounded-md border-0 px-2.5 py-1.5 text-base ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-brand-600 sm:text-sm ${className}`}
    />
  )
}
