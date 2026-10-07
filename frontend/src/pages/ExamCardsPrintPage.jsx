import { ArrowLeft, Printer } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { examsApi } from '../api/exams'
import Alert from '../components/Alert'
import SchoolLogo from '../components/brand/SchoolLogo'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import { FullPageSpinner } from '../components/Spinner'
import useAuth from '../hooks/useAuth'
import useFetch from '../hooks/useFetch'
import { isAdminRole } from '../utils/constants'
import { formatDateRange, paginate } from '../utils/exams'

function Field({ label, value }) {
  return (
    <div className="grid grid-cols-[6.5rem_0.5rem_1fr] text-[11pt] leading-snug">
      <span className="text-slate-600">{label}</span>
      <span>:</span>
      <span className="font-semibold break-words text-slate-900">{value || '-'}</span>
    </div>
  )
}

// Satu kartu peserta (ukuran ± 1/8 halaman A4). Garis putus-putus = batas potong.
function ExamCard({ card, data }) {
  const { event, school } = data
  return (
    <article className="flex h-full flex-col border border-dashed border-slate-400 p-3 text-slate-900">
      <header className="flex items-center gap-2 border-b-2 border-brand-700 pb-2">
        <SchoolLogo className="size-11 shrink-0" />
        <div className="min-w-0">
          <p className="text-[9pt] font-bold tracking-wide text-brand-700 uppercase">
            Kartu Peserta Ujian
          </p>
          <p className="truncate text-[11pt] leading-tight font-bold">{school.name}</p>
          <p className="truncate text-[9pt] text-slate-600">{event.name}</p>
        </div>
      </header>
      <div className="mt-2 space-y-0.5">
        <Field label="Nama" value={card.student_name} />
        <Field label="NIS" value={card.nis} />
        <Field label="Kelas" value={data.classroom_name} />
        <Field label="No. Peserta" value={card.exam_number} />
        <Field label="Ruang" value={card.room} />
      </div>
      <footer className="mt-auto flex items-end justify-between gap-3 pt-2">
        <p className="min-w-0 text-[8pt] leading-snug text-slate-600">
          {formatDateRange(event.exam_start, event.exam_end)}
          {event.card_note && <span className="mt-0.5 block">{event.card_note}</span>}
        </p>
        {(event.signer_title || event.signer_name) && (
          <div className="w-36 shrink-0 text-center text-[8pt]">
            <p>{event.signer_title}</p>
            <div className="h-9" />
            <p className="border-t border-slate-500 pt-0.5 font-semibold">
              {event.signer_name || ' '}
            </p>
          </div>
        )}
      </footer>
    </article>
  )
}

// Halaman cetak kartu ujian satu kelas, di luar tata letak menu agar hasil cetak bersih.
// Ukuran halaman A4 diatur di index.css (@page). Tombol di atas tidak ikut tercetak.
export default function ExamCardsPrintPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const classroom = searchParams.get('kelas') ?? ''
  const { user } = useAuth()
  const back = `${isAdminRole(user.role) ? '/admin' : '/guru'}/ujian/${id}`
  const result = useFetch(examsApi.cards, { id, classroom })

  if (result.loading && !result.data) return <FullPageSpinner />
  const data = result.data
  const pages = paginate(data?.cards ?? [])

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3 shadow-sm print:hidden">
        <div className="flex items-center gap-3">
          <Link
            to={back}
            className="inline-flex size-9 items-center justify-center rounded-full text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
            aria-label="Kembali ke acara ujian"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
          <div>
            <h1 className="font-semibold text-slate-900">
              Kartu Ujian {data ? `• ${data.classroom_name}` : ''}
            </h1>
            {data && (
              <p className="text-xs text-slate-500">
                {data.cards.length} kartu, {pages.length} lembar A4
                {data.skipped_count > 0 &&
                  ` • ${data.skipped_count} siswa belum memenuhi syarat (tidak dicetak)`}
              </p>
            )}
          </div>
        </div>
        <Button onClick={() => window.print()} disabled={!pages.length}>
          <Printer className="size-4" aria-hidden="true" /> Cetak
        </Button>
      </div>

      <div className="p-4 print:p-0">
        <Alert type="error" className="mx-auto max-w-3xl print:hidden">
          {result.error}
        </Alert>
        {data && pages.length === 0 && (
          <div className="mx-auto max-w-3xl print:hidden">
            <EmptyState title="Tidak ada kartu untuk dicetak">
              Belum ada siswa di kelas ini yang memenuhi syarat atau dikecualikan.
            </EmptyState>
          </div>
        )}
        {/* Lembar A4 (210 x 297 mm, margin 10 mm): 2 kolom x 4 baris kartu. */}
        <div className="overflow-x-auto print:overflow-visible">
          {pages.map((cards, index) => (
            <section
              key={index}
              className="mx-auto mb-4 grid h-[277mm] w-[190mm] grid-cols-2 grid-rows-4 gap-[4mm] bg-white p-0 shadow-md print:mb-0 print:shadow-none print:break-after-page print:last:break-after-auto"
              aria-label={`Lembar ${index + 1}`}
            >
              {cards.map((card) => (
                <ExamCard key={card.student} card={card} data={data} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
