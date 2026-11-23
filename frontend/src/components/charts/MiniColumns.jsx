import { barPercent, niceMax } from '../../utils/statistics'

/**
 * Grafik batang mini tanpa sumbu (sparkline), mis. pengumpulan 8 minggu di kartu Beranda.
 * Angka lengkapnya ada di halaman Statistik; di sini cukup bentuk naik-turunnya.
 * `label` = kalimat ringkas untuk pembaca layar (grafiknya sendiri disembunyikan).
 */
export default function MiniColumns({ values, label, className = 'bg-slate-600' }) {
  const top = niceMax(values)
  return (
    <div className="flex h-10 items-end gap-1" role="img" aria-label={label}>
      {values.map((value, index) => (
        <span
          key={index}
          className={`w-2.5 rounded-t-sm sm:w-3 ${value ? className : 'bg-slate-300'}`}
          style={{ height: value ? `${Math.max(barPercent(value, top), 8)}%` : '2px' }}
        />
      ))}
    </div>
  )
}
