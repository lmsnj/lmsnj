import { ArrowLeft } from 'lucide-react'
import usePresentationBack from '../../hooks/usePresentationBack'
import Alert from '../Alert'
import { FullPageSpinner } from '../Spinner'

/** Layar memuat / galat / fitur mati sebelum presentasi bisa dimulai. */
export default function PresentationStatus({ error, featureOff }) {
  const back = usePresentationBack()
  if (!error && !featureOff) return <FullPageSpinner />
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="max-w-md space-y-4 text-center">
        <Alert type={error ? 'error' : 'warning'}>
          {error || 'Mode Presentasi Kelas belum diaktifkan untuk sekolah ini.'}
        </Alert>
        <button
          type="button"
          onClick={back}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Kembali
        </button>
      </div>
    </div>
  )
}
