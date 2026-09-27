import { useId } from 'react'

export const inputClass =
  // text-base di HP mencegah Safari iPhone melakukan zoom otomatis saat input disentuh.
  'block w-full rounded-lg border-0 px-3 py-2 text-base text-slate-900 sm:text-sm ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-600 disabled:bg-slate-50'

export default function TextField({ label, error, hint, id, className = '', ...props }) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        className={`${inputClass} ${error ? 'ring-red-400' : 'ring-slate-300'}`}
        {...props}
      />
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  )
}
