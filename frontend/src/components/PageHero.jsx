import { Search } from 'lucide-react'

// Posisi & warna kotak ikon hiasan di sisi kanan banner (layar lebar).
const SLOTS = [
  'top-6 right-[38%] rotate-[-12deg] bg-orange-400',
  'top-24 right-[27%] rotate-[8deg] bg-fuchsia-500',
  'top-5 right-[16%] rotate-[10deg] bg-slate-800',
  'bottom-5 right-[33%] rotate-[6deg] bg-sky-500',
  'bottom-8 right-[6%] rotate-[-8deg] bg-blue-600',
  'top-14 right-[4%] rotate-[-4deg] bg-violet-500',
  'bottom-4 right-[19%] rotate-[-14deg] bg-amber-400',
]

/**
 * Banner hijau di atas halaman daftar (materi, tugas, asesmen, obrolan, nilai).
 * Hiasan = ikon lucide dalam kotak berwarna (`icons`, maks. 7) + ikon besar samar (`centerIcon`),
 * bukan gambar dari produk lain.
 * - `search`: { value, onChange, onSubmit, placeholder } — kotak pencarian + tombol Cari (opsional)
 * - `stats`: [{ icon, content }] — baris info di bawah (angka dari data asli)
 * - `actions`: tombol di bawah judul, mis. "+ Bagikan Tugas"
 */
export default function PageHero({
  title,
  description,
  icons = [],
  centerIcon: CenterIcon,
  search,
  stats = [],
  actions,
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-brand-600 text-white shadow-sm">
      <div
        className="absolute -top-24 -right-16 hidden size-80 rounded-full bg-amber-400/90 lg:block"
        aria-hidden="true"
      />
      <div
        className="absolute -right-10 -bottom-20 size-48 rounded-full bg-brand-500 lg:right-1/4 lg:size-64"
        aria-hidden="true"
      />
      <div className="absolute inset-y-0 right-0 hidden w-1/2 lg:block" aria-hidden="true">
        {icons.slice(0, SLOTS.length).map((Icon, index) => (
          <span
            key={index}
            className={`absolute flex size-16 items-center justify-center rounded-2xl text-white shadow-lg ring-4 ring-white/30 ${SLOTS[index]}`}
          >
            <Icon className="size-8" />
          </span>
        ))}
        {CenterIcon && (
          <CenterIcon className="absolute top-1/2 right-[26%] size-24 -translate-y-1/2 text-white/25" />
        )}
      </div>

      <div className="relative px-5 py-7 sm:px-8 sm:py-9 lg:max-w-[58%]">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-brand-50 sm:text-base">{description}</p>}
        {search && (
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              search.onSubmit?.()
            }}
            className="mt-5 flex items-center gap-2 rounded-xl bg-white p-1.5 shadow-lg"
          >
            <Search className="ml-2 size-5 shrink-0 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={search.placeholder}
              aria-label={search.placeholder}
              className="min-w-0 flex-1 border-0 bg-transparent px-1 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:ring-0 focus:outline-none sm:text-sm"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-900"
            >
              Cari
            </button>
          </form>
        )}
        {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
        {stats.length > 0 && (
          <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-brand-50">
            {stats.map(({ icon: Icon, content }, index) => (
              <li key={index} className="flex items-center gap-2">
                <Icon className="size-4 text-amber-300" aria-hidden="true" />
                <span>{content}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

// Tombol putih di banner (mis. "+ Bagikan Tugas").
export function HeroButton({ icon: Icon, children, ...props }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-brand-800 shadow-sm hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      {...props}
    >
      {Icon && <Icon className="size-4" aria-hidden="true" />}
      {children}
    </button>
  )
}
