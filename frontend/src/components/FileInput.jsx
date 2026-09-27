import { useId, useState } from 'react'
import { MAX_UPLOAD_MB } from '../utils/constants'

/**
 * Pemilih file dengan cek ukuran di browser (agar tidak menunggu upload lama hanya untuk ditolak).
 * `onChange(file | null)` dipanggil dengan file terpilih.
 */
export default function FileInput({ label, accept, onChange, error, hint, required }) {
  const id = useId()
  const [sizeError, setSizeError] = useState('')

  const handleChange = (event) => {
    const chosen = event.target.files[0] ?? null
    setSizeError('')
    if (chosen && chosen.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setSizeError(`Ukuran file maksimal ${MAX_UPLOAD_MB} MB.`)
      event.target.value = ''
      onChange(null)
      return
    }
    onChange(chosen)
  }

  const message = sizeError || error
  return (
    <div>
      {label && (
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor={id}>
          {label}
        </label>
      )}
      <input
        id={id}
        type="file"
        accept={accept}
        onChange={handleChange}
        required={required}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-800 hover:file:bg-brand-100"
      />
      <p className={`mt-1 text-xs ${message ? 'text-red-600' : 'text-slate-500'}`}>
        {message || hint || `Maksimal ${MAX_UPLOAD_MB} MB.`}
      </p>
    </div>
  )
}

export function UploadProgress({ value }) {
  if (value === null || value === undefined) return null
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-brand-600 transition-all" style={{ width: `${value}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-500">Mengunggah... {value}%</p>
    </div>
  )
}
