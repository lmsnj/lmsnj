import { Printer } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { mediaPlayApi } from '../api/learningMedia'
import Alert from '../components/Alert'
import Button from '../components/Button'
import RichText from '../components/RichText'
import Spinner from '../components/Spinner'
import useBranding from '../hooks/useBranding'
import useFetch from '../hooks/useFetch'
import { flattenStations } from '../mpi/engine'

/**
 * Lembar Ringkas media: tujuan + ringkasan tiap stasiun dan glosarium. Disimpan sebagai PDF lewat
 * "Cetak" browser (tanpa pustaka tambahan). Di luar DashboardLayout agar menu tidak ikut tercetak.
 */
export default function MediaSummaryPrintPage() {
  const { id } = useParams()
  const { data, error } = useFetch(mediaPlayApi.get, id)
  const { branding } = useBranding()

  if (error)
    return (
      <Alert type="error" className="m-6">
        {error}
      </Alert>
    )
  if (!data) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }
  const stations = flattenStations(data.content)
  const glossary = data.content.glossary ?? []
  return (
    <div className="mx-auto max-w-3xl space-y-5 bg-white p-6 text-sm text-slate-900 print:p-0">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <p className="text-slate-600">
          Tekan Cetak lalu pilih “Simpan sebagai PDF” untuk menyimpan.
        </p>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden="true" /> Cetak
        </Button>
      </div>
      <header className="border-b-2 border-brand-600 pb-2">
        <p className="text-xs text-slate-500">{branding.school_name}</p>
        <h1 className="text-xl font-bold">Lembar Ringkas: {data.title}</h1>
      </header>
      {data.content.parts.map((part, partIndex) => (
        <section key={part.id} className="space-y-3">
          <h2 className="text-base font-bold text-brand-800">
            Bagian {partIndex + 1}: {part.title}
          </h2>
          {stations
            .filter((station) => station.partId === part.id)
            .map((station) => (
              <article
                key={station.id}
                className="break-inside-avoid rounded-lg p-3 ring-1 ring-slate-200"
              >
                <h3 className="font-bold">
                  {station.number}. {station.title}
                </h3>
                {station.objectives?.length > 0 && (
                  <p className="mt-1 text-xs text-slate-600">
                    Tujuan: {station.objectives.join('; ')}
                  </p>
                )}
                {station.summary?.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 ps-5">
                    {station.summary.map((point, index) => (
                      <li key={index}>
                        <RichText text={point} as="span" />
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
        </section>
      ))}
      {glossary.length > 0 && (
        <section className="break-inside-avoid space-y-2">
          <h2 className="text-base font-bold text-brand-800">Glosarium</h2>
          <table className="w-full border-collapse text-left">
            <tbody>
              {glossary.map((entry) => (
                <tr key={entry.term} className="border-b border-slate-200 align-top">
                  <th className="w-1/3 py-1 pe-3 font-semibold">{entry.term}</th>
                  <td className="py-1">
                    <RichText text={entry.meaning} as="span" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
