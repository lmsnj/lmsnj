const COLORS = {
  gray: 'bg-slate-100 text-slate-700',
  green: 'bg-brand-100 text-brand-800',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-sky-100 text-sky-800',
  amber: 'bg-amber-100 text-amber-800',
}

export default function Badge({ color = 'gray', children }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${COLORS[color]}`}>
      {children}
    </span>
  )
}
