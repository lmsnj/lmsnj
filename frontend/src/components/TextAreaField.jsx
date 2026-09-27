import { useId } from 'react'
import { inputClass } from './TextField'

export default function TextAreaField({
  label,
  error,
  hint,
  id,
  rows = 4,
  className = '',
  ...props
}) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        rows={rows}
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
