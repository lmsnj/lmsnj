import { CircleCheck, ExternalLink, Hourglass } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  contentOrigin,
  h5pMessage,
  initMessage,
  isSafeEmbed,
  MAX_HEIGHT,
  newNonce,
  parseMessage,
} from '../bridge'
import { Rich } from './ExplainSteps'
import { Question } from './PracticeSteps'

/**
 * Iframe konten HTML5/H5P dari origin lain, di dalam sandbox. Pesan bridge (docs/mpi-bridge.md) dan resizer
 * H5P diteruskan lewat `onEvent({type, ...})` setelah divalidasi (asal iframe, origin, nonce).
 */
function EmbedFrame({ url, height, title, stepId, nickname, onEvent }) {
  const frameRef = useRef(null)
  const [nonce] = useState(newNonce)
  const [frameHeight, setFrameHeight] = useState(height || 480)
  const origin = contentOrigin(url)
  const safe = isSafeEmbed(url, window.location.origin, import.meta.env.DEV)
  const onEventRef = useRef(onEvent)
  useEffect(() => {
    onEventRef.current = onEvent
  })

  useEffect(() => {
    if (!safe) return undefined
    const listener = (event) => {
      const frame = frameRef.current?.contentWindow
      const raw = {
        origin: event.origin,
        data: event.data,
        fromFrame: Boolean(frame) && event.source === frame,
      }
      const h5p = h5pMessage(raw, origin)
      if (h5p) {
        if (h5p.height) setFrameHeight(h5p.height)
        if (h5p.reply) frame.postMessage(h5p.reply, origin)
        return
      }
      const message = parseMessage(raw, origin, nonce)
      if (!message) return
      if (message.type === 'resize') setFrameHeight(message.height)
      onEventRef.current?.(message)
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [safe, origin, nonce])

  if (!safe) {
    return (
      <p className="rounded-lg bg-red-50 p-3 text-[0.9em] text-red-700 ring-1 ring-red-200">
        Konten ini tidak bisa ditampilkan dengan aman (harus https dan dari situs lain).
      </p>
    )
  }
  return (
    <div className="space-y-1.5">
      <div className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
        <iframe
          ref={frameRef}
          src={url}
          title={title || 'Konten interaktif'}
          // Origin lain + sandbox: konten tidak bisa membaca data/login LMS, membuka jendela utama, atau pindah halaman.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          referrerPolicy="no-referrer"
          allow="fullscreen"
          allowFullScreen
          loading="lazy"
          onLoad={() =>
            frameRef.current?.contentWindow?.postMessage(
              initMessage(nonce, stepId, nickname),
              origin,
            )
          }
          style={{ height: Math.min(frameHeight, MAX_HEIGHT) }}
          className="block w-full border-0"
        />
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[0.8em] font-semibold text-brand-700"
      >
        <ExternalLink className="size-3.5" aria-hidden="true" /> Buka di tab baru (jika tidak
        tampil)
      </a>
    </div>
  )
}

const nicknameOf = (user) => (user?.full_name || user?.username || '').split(' ')[0]

/** Konten HTML5/H5P tanpa nilai. */
export function EmbedStep({ step, user }) {
  return (
    <div className="space-y-3">
      <Rich text={step.body} user={user} />
      <EmbedFrame
        url={step.url}
        height={step.height}
        title={step.title}
        stepId={step.id}
        nickname={nicknameOf(user)}
      />
    </div>
  )
}

/**
 * Tugas HTML5/H5P. "bridge": konten melaporkan selesai (+ skor) -> nilai { completed, score, max };
 * "manual": siswa mencentang sendiri. Nilai diperiksa di server (skor minimal).
 */
export function EmbedTaskStep({ step, user, value, onChange, review }) {
  const [progress, setProgress] = useState(null)
  const done = value?.completed
  const onEvent = (message) => {
    if (message.type === 'progress') setProgress(message.value)
    if (message.type === 'complete' && onChange)
      onChange({ completed: true, score: message.score, max: message.max })
  }
  return (
    <div className="space-y-3">
      <Question step={step} user={user} />
      <EmbedFrame
        url={step.url}
        height={step.height}
        title={step.title}
        stepId={step.id}
        nickname={nicknameOf(user)}
        onEvent={step.completion === 'bridge' ? onEvent : undefined}
      />
      {step.completion === 'manual' ? (
        <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-[0.95em] ring-1 ring-slate-200">
          <input
            type="checkbox"
            className="mt-0.5 size-5 rounded border-slate-300"
            checked={Boolean(done)}
            disabled={!onChange}
            onChange={(event) =>
              onChange({ completed: event.target.checked, score: null, max: null })
            }
          />
          <span>Saya sudah menyelesaikan kegiatan di atas.</span>
        </label>
      ) : (
        <p
          className={`flex items-center gap-2 rounded-lg p-3 text-[0.9em] ring-1 ${
            done
              ? 'bg-brand-50 text-brand-800 ring-brand-200'
              : 'bg-amber-50 text-amber-900 ring-amber-200'
          }`}
          aria-live="polite"
        >
          {done ? (
            <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
          ) : (
            <Hourglass className="size-5 shrink-0" aria-hidden="true" />
          )}
          {done
            ? `Konten melaporkan selesai${value.score !== null && value.score !== undefined ? ` (skor ${value.score}/${value.max})` : ''}. Tekan Periksa.`
            : `Kerjakan kontennya sampai selesai${progress !== null ? ` (${Math.round(progress * 100)}%)` : ''}.${
                step.min_score ? ` Skor minimal ${step.min_score}%.` : ''
              }`}
        </p>
      )}
      {review?.result?.percent !== undefined && review.result.percent !== null && (
        <p className="text-[0.85em] text-slate-600">Skor tercatat: {review.result.percent}%.</p>
      )}
    </div>
  )
}
