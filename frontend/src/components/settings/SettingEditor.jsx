import { Plus, Trash2 } from 'lucide-react'
import { useId } from 'react'
import { totalWeight } from '../../utils/settings'
import Button from '../Button'
import { inputClass } from '../TextField'

const fieldClass = `${inputClass} ring-slate-300`

// Angka dari input teks: kosong tetap '' agar bisa dihapus saat mengetik; backend yang memeriksa.
const toNumber = (text) => (text === '' ? '' : Number(text))

/**
 * Isian satu pengaturan sesuai jenisnya (lihat registry.py di backend):
 * int, choice, bool, multi, bands, weights, fields. Nilai dikirim apa adanya; batas & aturan
 * diperiksa di backend dan pesannya ditampilkan halaman.
 */
export default function SettingEditor({ setting, value, onChange, disabled }) {
  const id = useId()
  const label = `${setting.label}`

  switch (setting.kind) {
    case 'int':
      return (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="number"
            inputMode="numeric"
            aria-label={label}
            min={setting.min}
            max={setting.max}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(toNumber(event.target.value))}
            className={`${fieldClass} max-w-32`}
          />
          {setting.unit && <span className="text-sm text-slate-500">{setting.unit}</span>}
          <span className="text-xs text-slate-400">
            ({setting.min}–{setting.max})
          </span>
        </div>
      )
    case 'choice':
    case 'mode':
      return (
        <select
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={`${fieldClass} max-w-sm`}
        >
          {setting.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    case 'bool':
      return (
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(value)}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            className="size-5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
          />
          {value ? 'Ya' : 'Tidak'}
        </label>
      )
    case 'multi':
      return (
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {setting.options.map((option) => (
            <label
              key={option.value}
              className="inline-flex items-center gap-2 text-sm text-slate-700"
            >
              <input
                type="checkbox"
                checked={value.includes(option.value)}
                disabled={disabled}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...value, option.value]
                      : value.filter((item) => item !== option.value),
                  )
                }
                className="size-5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
              />
              {option.label}
            </label>
          ))}
        </div>
      )
    case 'bands':
      return (
        <RowsEditor
          rows={value}
          onChange={onChange}
          disabled={disabled}
          numberField="min"
          numberLabel="Batas bawah"
          prefix="≥"
          newRow={{ label: '', min: 0 }}
          footer={`Urutkan dari batas tertinggi; batas terakhir ${setting.min}.`}
        />
      )
    case 'weights': {
      const total = totalWeight(value)
      return (
        <RowsEditor
          rows={value}
          onChange={onChange}
          disabled={disabled}
          fixed={setting.fixed}
          numberField="weight"
          numberLabel="Bobot"
          suffix="%"
          newRow={{ label: '', weight: 0 }}
          footer={
            <span className={total === 100 ? 'text-brand-700' : 'font-semibold text-red-600'}>
              Jumlah: {total}% {total !== 100 && '(harus 100%)'}
            </span>
          }
        />
      )
    }
    case 'fields':
      return (
        <div className="flex flex-wrap gap-4">
          {setting.fields.map((field) => (
            <label key={field.name} className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">{field.label}</span>
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={field.min}
                  max={field.max}
                  value={value[field.name]}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({ ...value, [field.name]: toNumber(event.target.value) })
                  }
                  className={`${fieldClass} max-w-28`}
                />
                {field.unit}
              </span>
            </label>
          ))}
        </div>
      )
    default:
      return <p className="text-sm text-slate-500">Jenis isian tidak dikenal.</p>
  }
}

// Daftar baris "label + angka" (predikat, status, bobot).
function RowsEditor({
  rows,
  onChange,
  disabled,
  fixed = false,
  numberField,
  numberLabel,
  prefix,
  suffix,
  newRow,
  footer,
}) {
  const update = (index, patch) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            aria-label={`Label baris ${index + 1}`}
            value={row.label}
            maxLength={30}
            disabled={disabled || fixed}
            onChange={(event) => update(index, { label: event.target.value })}
            className={`${fieldClass} max-w-44`}
          />
          {prefix && <span className="text-sm text-slate-500">{prefix}</span>}
          <input
            type="number"
            inputMode="numeric"
            aria-label={`${numberLabel} baris ${index + 1}`}
            value={row[numberField]}
            disabled={disabled}
            onChange={(event) => update(index, { [numberField]: toNumber(event.target.value) })}
            className={`${fieldClass} max-w-24`}
          />
          {suffix && <span className="text-sm text-slate-500">{suffix}</span>}
          {!fixed && (
            <button
              type="button"
              disabled={disabled || rows.length <= 1}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
              className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
              aria-label={`Hapus baris ${index + 1}`}
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {!fixed && (
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => onChange([...rows, newRow])}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Tambah baris
          </Button>
        )}
        {footer}
      </div>
    </div>
  )
}
