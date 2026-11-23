import { useState } from 'react'
import { barPercent, niceMax } from '../../utils/statistics'

const GRID_STEPS = [1, 0.5, 0]

/**
 * Grafik batang tegak satu seri (mis. per minggu), digambar dengan div + Tailwind (tanpa pustaka).
 * - `items`: [{ key, label, axisLabel, value, detail }] — `value` null = belum ada data (batang
 *   tidak digambar); `axisLabel` = label pendek di sumbu bawah (bawaan: `label`)
 * - `max`: batas atas sumbu (bawaan: dihitung dari data), `format(value)`: teks angka
 * Arahkan kursor / fokus (Tab) ke batang untuk melihat angkanya di baris atas grafik.
 */
export default function ColumnChart({ items, max, format = String, label }) {
  const top = max ?? niceMax(items.map((item) => item.value))
  const [activeKey, setActiveKey] = useState(null)
  // Tanpa sorotan, tampilkan data terakhir yang ada isinya agar baris atas tidak kosong.
  const latest = items.findLast((item) => item.value) ?? items[items.length - 1]
  const active = items.find((item) => item.key === activeKey) ?? latest

  return (
    <div>
      <p className="mb-3 min-h-10 text-sm text-slate-600" aria-live="polite">
        <span className="font-medium text-slate-900">{active.label}</span>
        <br />
        <span className="text-lg font-bold text-slate-900 tabular-nums">
          {active.value == null ? 'Belum ada data' : format(active.value)}
        </span>
        {active.detail && <span className="ml-2 text-xs text-slate-500">{active.detail}</span>}
      </p>

      <div className="flex gap-2">
        {/* Angka sumbu kiri */}
        <div className="relative h-48 w-9 shrink-0 text-right text-xs text-slate-400 tabular-nums">
          {GRID_STEPS.map((step) => (
            <span
              key={step}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${(1 - step) * 100}%` }}
            >
              {format(top * step)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-48">
            {GRID_STEPS.map((step) => (
              <div
                key={step}
                className={`absolute inset-x-0 border-t ${step ? 'border-slate-100' : 'border-slate-300'}`}
                style={{ top: `${(1 - step) * 100}%` }}
                aria-hidden="true"
              />
            ))}
            <div
              className="absolute inset-0 flex items-end gap-1 sm:gap-2"
              role="list"
              aria-label={label}
            >
              {items.map((item) => {
                const isActive = item.key === active.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="listitem"
                    aria-label={`${item.label}: ${item.value == null ? 'belum ada data' : format(item.value)}`}
                    onMouseEnter={() => setActiveKey(item.key)}
                    onFocus={() => setActiveKey(item.key)}
                    onClick={() => setActiveKey(item.key)}
                    className="group flex h-full flex-1 items-end justify-center rounded-t-md focus:outline-none focus-visible:bg-brand-50"
                  >
                    {item.value == null ? (
                      <span className="mb-1 h-0.5 w-3/5 max-w-10 rounded bg-slate-200" />
                    ) : (
                      <span
                        className={`w-3/5 max-w-10 rounded-t ${isActive ? 'bg-brand-700' : 'bg-brand-600 group-hover:bg-brand-700'}`}
                        style={{
                          height: `${Math.max(barPercent(item.value, top), item.value ? 1 : 0)}%`,
                        }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
          {/* Label sumbu bawah */}
          <div className="mt-2 flex gap-1 sm:gap-2" aria-hidden="true">
            {items.map((item) => (
              <span
                key={item.key}
                className={`flex-1 truncate text-center text-[11px] sm:text-xs ${item.key === active.key ? 'font-semibold text-slate-900' : 'text-slate-500'}`}
              >
                {item.axisLabel ?? item.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
