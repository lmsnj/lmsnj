export default function EmptyState({ title, children }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {children && <p className="mt-1 text-sm text-slate-500">{children}</p>}
    </div>
  )
}
