import { barPercent, niceMax } from '../../utils/statistics'

/**
 * Grafik batang mendatar satu seri (mis. per kelas): nama di kiri, batang, angka di kanan.
 * Cocok untuk banyak baris dengan nama panjang dan tetap terbaca di HP.
 * - `items`: [{ key, label, value, detail }] — `value` null = "belum ada" (tanpa batang)
 * - `max`: batas atas (bawaan: dihitung dari data), `format(value)`: teks angka
 */
export default function BarList({ items, max, format = String, label }) {
  const top = max ?? niceMax(items.map((item) => item.value))
  return (
    <ul className="max-h-96 space-y-2.5 overflow-y-auto pr-1" aria-label={label}>
      {items.map((item) => (
        <li
          key={item.key}
          className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-3 text-sm sm:grid-cols-[8rem_1fr_4rem]"
          title={item.detail}
        >
          <span className="truncate text-slate-700">{item.label}</span>
          <span className="h-3 rounded bg-slate-100" aria-hidden="true">
            {item.value != null && (
              <span
                className="block h-full rounded bg-brand-600"
                style={{ width: `${Math.max(barPercent(item.value, top), item.value ? 1 : 0)}%` }}
              />
            )}
          </span>
          <span className="text-right font-semibold text-slate-900 tabular-nums">
            {item.value == null ? (
              <span className="font-normal text-slate-400">–</span>
            ) : (
              format(item.value)
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
