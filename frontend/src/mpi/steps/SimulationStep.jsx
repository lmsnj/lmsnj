import { CircleAlert, CircleCheck, Hourglass, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Button from '../../components/Button'
import {
  clampHeight,
  isSafeSimulationSrc,
  parseSimulationMessage,
  SIM_DEFAULT_HEIGHT,
  SIM_READY_TIMEOUT,
  simulationInit,
} from '../simulation'
import { Rich } from './ExplainSteps'

/**
 * Iframe peraga (/mpi/...) + protokol mpi:* (lihat simulation.js). Dipakai pemutar siswa dan pratinjau
 * Studio. `onDone(detail)` saat simulasi mengirim mpi:done; `onFail()` jika peraga tidak siap dalam
 * 8 detik (siswa tetap boleh lanjut).
 */
export function SimulationFrame({ src, params, height, title, onDone, onFail }) {
  const frameRef = useRef(null)
  const [status, setStatus] = useState('loading')
  const statusRef = useRef('loading')
  const [frameHeight, setFrameHeight] = useState(clampHeight(height || SIM_DEFAULT_HEIGHT))
  const safe = isSafeSimulationSrc(src)
  const handlers = useRef({ onDone, onFail, params })
  useEffect(() => {
    handlers.current = { onDone, onFail, params }
  })

  useEffect(() => {
    if (!safe) return undefined
    const update = (next) => {
      statusRef.current = next
      setStatus(next)
    }
    update('loading')
    const sendInit = () =>
      // Origin iframe sandbox = "null", jadi targetOrigin harus '*'; isinya hanya params dari JSON media.
      frameRef.current?.contentWindow?.postMessage(simulationInit(handlers.current.params), '*')
    const listener = (event) => {
      const frame = frameRef.current?.contentWindow
      const message = parseSimulationMessage(event.data, Boolean(frame) && event.source === frame)
      if (!message) return
      if (message.type === 'ready') {
        update('ready')
        sendInit()
      } else if (message.type === 'resize') {
        setFrameHeight(message.height)
      } else if (message.type === 'done') {
        update('ready')
        handlers.current.onDone?.(message.detail)
      }
    }
    window.addEventListener('message', listener)
    const timer = setTimeout(() => {
      if (statusRef.current !== 'loading') return
      update('failed')
      handlers.current.onFail?.()
    }, SIM_READY_TIMEOUT)
    return () => {
      window.removeEventListener('message', listener)
      clearTimeout(timer)
    }
  }, [safe, src])

  if (!safe) {
    return (
      <p className="rounded-lg bg-red-50 p-3 text-[0.9em] text-red-700 ring-1 ring-red-200">
        Simulasi ini tidak bisa ditampilkan: path file harus diawali /mpi/ dan berakhiran .html.
      </p>
    )
  }
  const restart = () => frameRef.current?.contentWindow?.postMessage(simulationInit(params), '*')
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
        <iframe
          ref={frameRef}
          src={src}
          title={title || 'Simulasi'}
          // Tanpa allow-same-origin: peraga tidak bisa membaca data/login LMS, membuka jendela, atau pindah halaman.
          // allow-downloads: peraga boleh menyimpan hasil karya siswa (mis. tombol "Unduh hasil" PNG/SVG).
          sandbox="allow-scripts allow-downloads"
          referrerPolicy="no-referrer"
          onError={() => {
            statusRef.current = 'failed'
            setStatus('failed')
            handlers.current.onFail?.()
          }}
          style={{ height: frameHeight }}
          className="block w-full border-0"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={restart} disabled={status === 'failed'}>
          <RotateCcw className="size-4" aria-hidden="true" /> Ulangi
        </Button>
        {status === 'failed' && (
          <p className="flex items-center gap-2 text-[0.85em] text-amber-800" role="status">
            <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
            Peraga belum bisa dimuat. Tidak apa-apa, kamu boleh lanjut ke langkah berikutnya.
          </p>
        )}
      </div>
    </div>
  )
}

/** Langkah "simulation": instruksi, peraga, status, dan penjelasan setelah mpi:done. */
export function SimulationStep({ step, user, done, onSimulationDone, onSimulationFail }) {
  const needsDone = step.require_done !== false
  return (
    <div className="space-y-3">
      <Rich text={step.text} user={user} />
      <SimulationFrame
        key={`${step.id}-${step.src}`}
        src={step.src}
        params={step.params}
        height={step.height}
        title={step.title}
        onDone={onSimulationDone}
        onFail={onSimulationFail}
      />
      <p
        className={`flex items-center gap-2 text-[0.85em] font-semibold ${
          done ? 'text-brand-700' : 'text-slate-500'
        }`}
        aria-live="polite"
      >
        {done ? (
          <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
        ) : (
          <Hourglass className="size-4 shrink-0" aria-hidden="true" />
        )}
        {done
          ? 'Selesai'
          : needsDone
            ? 'Selesaikan tantangan di peraga untuk lanjut'
            : 'Coba peraganya, lalu tekan Lanjut'}
      </p>
      {done && step.explanation && (
        <div className="rounded-xl bg-brand-50 p-4 ring-1 ring-brand-200" role="status">
          <p className="flex items-center gap-2 font-bold text-brand-800">
            <CircleCheck className="size-5" aria-hidden="true" /> Hebat!
          </p>
          <Rich text={step.explanation} user={user} className="mt-1 text-[0.95em]" />
        </div>
      )}
    </div>
  )
}
