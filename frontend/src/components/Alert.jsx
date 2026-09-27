const STYLES = {
  error: 'bg-red-50 text-red-700 ring-red-200',
  success: 'bg-brand-50 text-brand-800 ring-brand-100',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
}

export default function Alert({ type = 'info', children, className = '' }) {
  if (!children) return null
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`rounded-lg px-4 py-3 text-sm ring-1 ${STYLES[type]} ${className}`}
    >
      {children}
    </div>
  )
}
