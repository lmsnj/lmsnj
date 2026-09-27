import { ArrowLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { STRIPES } from '../utils/constants'
import SubjectIcon from './SubjectIcon'

// Lingkaran inisial nama (pengganti foto profil).
export function Avatar({ name, className = 'size-7 text-xs' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800 ${className}`}
    >
      {(name ?? '?').trim().charAt(0).toUpperCase()}
    </span>
  )
}

/**
 * Header halaman isi kelas: tombol kembali + remah roti, judul besar, tombol di kanan (`actions`),
 * dan baris info (mapel dengan ikon, tahun ajaran, guru).
 * - `back`: { to, label } halaman induk (mis. "Kelas Saya")
 * - `info`: daftar isi baris info (teks/elemen), ditampilkan setelah mapel
 */
export default function ClassHero({ back, title, subject, subjectLabel, info = [], actions }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl bg-brand-50 p-2 sm:p-3">
      <div className={`absolute inset-y-0 right-0 w-1/2 ${STRIPES}`} aria-hidden="true" />
      <section className="relative rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="relative overflow-hidden px-5 pt-4 pb-6 sm:px-8">
          <div
            className="absolute -right-10 -bottom-16 hidden h-40 w-2/3 -rotate-6 rounded-[4rem] bg-brand-50/70 sm:block"
            aria-hidden="true"
          />
          <nav aria-label="Remah roti" className="relative flex items-center gap-2 text-sm">
            <Link
              to={back.to}
              className="inline-flex size-9 items-center justify-center rounded-full text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
              aria-label={`Kembali ke ${back.label}`}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
            <Link to={back.to} className="text-slate-500 hover:text-brand-700 hover:underline">
              {back.label}
            </Link>
            <ChevronRight className="size-4 text-slate-400" aria-hidden="true" />
            <span className="truncate font-medium text-slate-800" aria-current="page">
              {title}
            </span>
          </nav>
          <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 px-5 py-3.5 text-sm text-slate-600 sm:px-8">
          {subject && (
            <span className="inline-flex items-center gap-2 font-semibold text-slate-800">
              <SubjectIcon name={subject} />
              {subjectLabel ?? subject}
            </span>
          )}
          {info.filter(Boolean).map((item, index) => (
            <span key={index} className="inline-flex items-center gap-2">
              {(subject || index > 0) && (
                <span className="text-slate-300" aria-hidden="true">
                  •
                </span>
              )}
              {item}
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}
