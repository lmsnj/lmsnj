import { Link } from 'react-router-dom'

// Kartu satu pengampu (mapel di satu kelas). Jika `to` diisi, kartu bisa diklik.
export default function SubjectCard({ title, subtitle, meta, to }) {
  const content = (
    <>
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      {meta && <p className="mt-3 text-xs text-slate-500">{meta}</p>}
    </>
  )
  const className =
    'block rounded-xl border-l-4 border-brand-600 bg-white p-5 shadow-sm ring-1 ring-slate-200'

  if (!to) return <div className={className}>{content}</div>
  return (
    <Link to={to} className={`${className} transition hover:shadow-md hover:ring-brand-600`}>
      {content}
    </Link>
  )
}
