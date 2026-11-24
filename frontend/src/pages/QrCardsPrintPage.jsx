import { ArrowLeft, Printer } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Alert from '../components/Alert'
import Button from '../components/Button'
import Spinner from '../components/Spinner'
import TextField from '../components/TextField'
import { schoolSettingsApi } from '../api/schoolSettings'
import useFetch from '../hooks/useFetch'
import usePresentationBack from '../hooks/usePresentationBack'
import { paginate } from '../utils/exams'
import { CARDS_PER_SHEET, cardNumbers, cardText, LETTERS } from '../utils/qrQuiz'

// Ukuran sisi kartu persegi (mm) per ukuran cetak; A5 = 2 kartu per A4, A6 = 4 kartu per A4.
const CARD_MM = { A5: 132, A6: 92 }
// Huruf di tiap sisi diputar menghadap keluar, agar terbaca tegak saat sisi itu di atas.
const SIDES = [
  { letter: LETTERS[0], className: 'top-[3%] left-1/2 -translate-x-1/2' },
  { letter: LETTERS[1], className: 'right-[3%] top-1/2 -translate-y-1/2 rotate-90' },
  { letter: LETTERS[2], className: 'bottom-[3%] left-1/2 -translate-x-1/2 rotate-180' },
  { letter: LETTERS[3], className: 'left-[3%] top-1/2 -translate-y-1/2 -rotate-90' },
]

function QrSvg({ number }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    // Koreksi galat tertinggi (H) agar tetap terbaca dari jauh / kartu agak kusut.
    QRCode.toString(cardText(number), { type: 'svg', errorCorrectionLevel: 'H', margin: 1 })
      .then(setSvg)
      .catch(() => setSvg(''))
  }, [number])
  // SVG dibuat sendiri oleh pustaka qrcode dari teks "SG:<nomor>", bukan dari isian pengguna.
  return <div className="size-full [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
}

function Card({ number, size }) {
  const side = CARD_MM[size]
  return (
    <article
      className="relative border border-dashed border-slate-400 bg-white text-slate-900"
      style={{ width: `${side}mm`, height: `${side}mm` }}
    >
      {SIDES.map(({ letter, className }) => (
        <span
          key={letter}
          className={`absolute flex items-baseline gap-1 font-bold ${className}`}
          style={{ fontSize: `${side / 9}mm`, lineHeight: 1 }}
        >
          {letter}
          <span className="font-semibold text-slate-500" style={{ fontSize: `${side / 30}mm` }}>
            {number}
          </span>
        </span>
      ))}
      <div className="absolute inset-[17%]">
        <QrSvg number={number} />
      </div>
    </article>
  )
}

/** /cetak/kartu-qr?dari=1&sampai=40 — set kartu kuis QR (sekali cetak, dilaminating, dipakai ulang). */
export default function QrCardsPrintPage() {
  const back = usePresentationBack()
  const [params, setParams] = useSearchParams()
  const settings = useFetch(schoolSettingsApi.effective, {})
  if (settings.error) return <Alert type="error">{settings.error}</Alert>
  if (!settings.data) {
    return (
      <div className="py-20 text-center text-brand-600">
        <Spinner />
      </div>
    )
  }
  const values = settings.data.values
  const size = values['kuis_qr.ukuran_kartu'] === 'A6' ? 'A6' : 'A5'
  const from = params.get('dari') ?? '1'
  const to = params.get('sampai') ?? String(values['kuis_qr.kartu_per_set'] ?? 40)
  const numbers = cardNumbers(from, to)
  const sheets = paginate(numbers, CARDS_PER_SHEET[size])
  const setRange = (key) => (event) => {
    const next = new URLSearchParams(params)
    next.set(key, event.target.value)
    setParams(next, { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-end justify-between gap-3 bg-white px-4 py-3 shadow-sm print:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={back}
            className="inline-flex size-9 items-center justify-center rounded-full text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
            aria-label="Kembali"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
          <div>
            <h1 className="font-semibold text-slate-900">Kartu Kuis QR</h1>
            <p className="text-xs text-slate-500">
              {numbers.length} kartu ukuran {size}, {sheets.length} lembar A4. Laminating agar awet.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <TextField
            label="Dari nomor"
            type="number"
            min={1}
            max={200}
            value={from}
            onChange={setRange('dari')}
            className="w-28"
          />
          <TextField
            label="Sampai"
            type="number"
            min={1}
            max={200}
            value={to}
            onChange={setRange('sampai')}
            className="w-28"
          />
          <Button onClick={() => window.print()} disabled={!numbers.length}>
            <Printer className="size-4" aria-hidden="true" /> Cetak
          </Button>
        </div>
      </div>

      <p className="mx-auto max-w-3xl px-4 pt-4 text-sm text-slate-600 print:hidden">
        Cara pakai: siswa memegang kartunya dengan huruf jawaban di sisi ATAS, lalu mengangkatnya
        menghadap guru. Jangan menutupi kotak QR dengan jari.
      </p>
      <div className="overflow-x-auto p-4 print:overflow-visible print:p-0">
        {sheets.map((sheet, index) => (
          <section
            key={index}
            className={`mx-auto mb-4 grid h-[277mm] w-[190mm] place-content-center place-items-center gap-[6mm] bg-white shadow-md print:mb-0 print:shadow-none print:break-after-page print:last:break-after-auto ${
              size === 'A6' ? 'grid-cols-2' : 'grid-cols-1'
            }`}
            aria-label={`Lembar ${index + 1}`}
          >
            {sheet.map((number) => (
              <Card key={number} number={number} size={size} />
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
