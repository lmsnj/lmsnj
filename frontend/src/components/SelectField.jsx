import { useId } from 'react'
import { inputClass } from './TextField'

export default function SelectField({ label, error, options, id, className = '', ...props }) {
  const autoId = useId()
  const selectId = id ?? autoId

  return (
    <div className={className}>
      {label && (
        <label htmlFor={selectId} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <select
        id={selectId}
        aria-invalid={Boolean(error)}
        className={`${inputClass} ${error ? 'ring-red-400' : 'ring-slate-300'}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
