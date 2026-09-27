import { Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { STRIPES } from '../utils/constants'
import { subjectStyle } from '../utils/subjectStyles'
import SubjectIcon from './SubjectIcon'

/**
 * Kartu satu kelas-mapel (Kelas Saya guru, Mapel Saya siswa).
 * `title` besar di kotak berwarna, ikon mapel `subject` + teks `subtitle` (bawaan: nama mapel),
 * lalu baris info di bawah (item pertama diberi ikon orang).
 */
export default function ClassCard({ to, title, subject, subtitle, info = [], badge }) {
  const style = subjectStyle(subject)
  return (
    <Link
      to={to}
      className="group block rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
    >
      <div className={`relative overflow-hidden rounded-xl px-5 py-5 ${style.soft}`}>
        <div className={`absolute inset-y-0 right-0 w-2/3 ${STRIPES}`} aria-hidden="true" />
        <div className="relative">
          <div className="flex items-start justify-between gap-2">
            <p className="text-lg font-bold text-slate-900 group-hover:text-brand-800">{title}</p>
            {badge}
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-700">
            <SubjectIcon name={subject} />
            {subtitle ?? subject}
          </p>
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-3 pb-1.5 text-sm text-slate-600">
        {info.filter(Boolean).map((item, index) => (
          <span key={index} className="inline-flex items-center gap-1.5">
            {index > 0 && (
              <span className="text-slate-300" aria-hidden="true">
                •
              </span>
            )}
            {index === 0 && <Users className="size-4 text-slate-400" aria-hidden="true" />}
            {item}
          </span>
        ))}
      </p>
    </Link>
  )
}
