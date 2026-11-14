import { ArrowLeft, Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SchoolLogo from '../components/brand/SchoolLogo'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import { cardStore } from '../utils/accountCards'
import { ROLE_LABELS } from '../utils/constants'
import { paginate } from '../utils/exams'

const CARDS_PER_PAGE = 10 // 2 kolom x 5 baris di kertas A4

function Field({ label, children, mono }) {
  return (
    <div className="grid grid-cols-[4.5rem_0.5rem_1fr] text-[9.5pt] leading-snug">
      <span className="text-slate-600">{label}</span>
      <span>:</span>
      <span className={`font-semibold break-all text-slate-900 ${mono ? 'font-mono' : ''}`}>
        {children}
      </span>
    </div>
  )
}

// Satu kartu akun (± 1/10 halaman A4). Garis putus-putus = batas potong.
function AccountCard({ account, schoolName, address }) {
  return (
    <article className="flex h-full flex-col border border-dashed border-slate-400 p-2.5 text-slate-900">
      <header className="flex items-center gap-2 border-b-2 border-brand-700 pb-1.5">
        <SchoolLogo className="size-9 shrink-0" />
        <div className="min-w-0">
          <p className="text-[8pt] font-bold tracking-wide text-brand-700 uppercase">
            Kartu Akun LMS
          </p>
          <p className="truncate text-[10pt] leading-tight font-bold">{schoolName}</p>
        </div>
      </header>
      <div className="mt-1.5 space-y-0.5">
        <Field label="Nama">{account.full_name}</Field>
        <Field label={account.classroom ? 'Kelas' : 'Peran'}>
          {account.classroom ?? account.role_display ?? ROLE_LABELS[account.role] ?? '-'}
        </Field>
        <Field label="Alamat">{address}</Field>
        <Field label="Username" mono>
          {account.username}
        </Field>
        <Field label="Password" mono>
          {account.password ?? <span className="font-sans font-normal">password Anda</span>}
        </Field>
      </div>
      <p className="mt-auto pt-1 text-[7.5pt] leading-tight text-slate-500">
        {account.password
          ? 'Ganti password setelah masuk pertama kali. Simpan kartu ini, jangan dipinjamkan.'
          : 'Simpan kartu ini, jangan dipinjamkan.'}
      </p>
    </article>
  )
}

// Halaman cetak kartu akun, di luar tata letak menu agar hasil cetak bersih. Data dititipkan
// lewat sessionStorage (utils/accountCards.js) dan dihapus saat halaman ini ditinggalkan, karena
// bisa berisi password.
export default function AccountCardsPrintPage() {
  const [data] = useState(() => cardStore.load())
  useEffect(() => () => cardStore.clear(), [])
  const pages = paginate(data?.accounts ?? [], CARDS_PER_PAGE)
  const back = data?.back ?? '/admin/pengguna'

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3 shadow-sm print:hidden">
        <div className="flex items-center gap-3">
          <Link
            to={back}
            className="inline-flex size-9 items-center justify-center rounded-full text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
            aria-label="Kembali"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
          <div>
            <h1 className="font-semibold text-slate-900">Kartu Akun</h1>
            {data && (
              <p className="text-xs text-slate-500">
                {data.accounts.length} kartu, {pages.length} lembar A4
              </p>
            )}
          </div>
        </div>
        <Button onClick={() => window.print()} disabled={!pages.length}>
          <Printer className="size-4" aria-hidden="true" /> Cetak
        </Button>
      </div>

      <div className="p-4 print:p-0">
        {pages.length === 0 && (
          <div className="mx-auto max-w-3xl print:hidden">
            <EmptyState title="Tidak ada kartu untuk dicetak">
              Data kartu sudah tidak tersedia (demi keamanan, password tidak disimpan). Kembali ke
              halaman Pengguna lalu buat kartu lagi.
            </EmptyState>
          </div>
        )}
        {/* Lembar A4 (210 x 297 mm, margin 10 mm): 2 kolom x 5 baris kartu. */}
        <div className="overflow-x-auto print:overflow-visible">
          {pages.map((accounts, index) => (
            <section
              key={index}
              className="mx-auto mb-4 grid h-[277mm] w-[190mm] grid-cols-2 grid-rows-5 gap-[3mm] bg-white shadow-md print:mb-0 print:shadow-none print:break-after-page print:last:break-after-auto"
              aria-label={`Lembar ${index + 1}`}
            >
              {accounts.map((account) => (
                <AccountCard
                  key={account.id ?? account.username}
                  account={account}
                  schoolName={data.schoolName}
                  address={data.address}
                />
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
