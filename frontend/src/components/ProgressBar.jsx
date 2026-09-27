// Bilah kemajuan kecil + keterangan, mis. "3 dari 6 siswa mengumpulkan".
export default function ProgressBar({ value, max, label, className = '' }) {
  const percent = max ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <span className={`block ${className}`}>
      <span
        className="block h-2 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
      >
        <span
          className="block h-full rounded-full bg-brand-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="mt-1 block text-xs text-slate-500">{label}</span>
    </span>
  )
}
