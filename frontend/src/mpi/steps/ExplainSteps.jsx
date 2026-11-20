import {
  Bot,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Lightbulb,
  RotateCw,
  UserRound,
} from 'lucide-react'
import { useState } from 'react'
import AuthImage from '../../components/AuthImage'
import RichText from '../../components/RichText'
import { youtubeEmbedUrl } from '../../utils/media'
import { assetUrl, directImageUrl, personalize } from '../engine'
import useImageSrc from '../useImageSrc'

/** Gambar langkah: unggahan Studio ("asset:<id>") atau alamat https. */
export function StepImage({ src, alt, className = '' }) {
  const asset = assetUrl(src)
  if (asset) {
    return (
      <AuthImage
        url={asset}
        alt={alt || ''}
        className={`mx-auto max-h-80 w-auto max-w-full rounded-lg object-contain ${className}`}
      />
    )
  }
  if (!directImageUrl(src)) return null
  return (
    <img
      src={src}
      alt={alt || ''}
      loading="lazy"
      className={`mx-auto max-h-80 w-auto max-w-full rounded-lg object-contain ${className}`}
    />
  )
}

/** Teks kaya (format sama dengan soal) + sapaan personal. */
export function Rich({ text, user, className = '', as }) {
  if (!text) return null
  return <RichText text={personalize(text, user)} className={className} as={as} />
}

/** Maskot: gambar pilihan sekolah, atau ikon robot bawaan dalam kotak berwarna. */
export function Mascot({ mascot, mood, size = 'size-12' }) {
  const { src } = useImageSrc(mascot?.image)
  if (src) {
    return (
      <img
        src={src}
        alt={mascot.name || 'Maskot'}
        className={`${size} shrink-0 rounded-xl object-cover`}
      />
    )
  }
  const tone = mood === 'oops' ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-700'
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-xl ${tone}`}>
      <Bot className="size-3/5" aria-hidden="true" />
    </span>
  )
}

export function TextStep({ step, user }) {
  return (
    <div className="space-y-3">
      <StepImage src={step.image} alt={step.caption} />
      {step.caption && <p className="text-center text-[0.85em] text-slate-500">{step.caption}</p>}
      <Rich text={step.body} user={user} className="leading-relaxed" />
    </div>
  )
}

export function DidYouKnowStep({ step, user }) {
  return (
    <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <p className="mb-2 flex items-center gap-2 font-bold text-amber-800">
        <Lightbulb className="size-5" aria-hidden="true" /> Tahukah kamu?
      </p>
      <TextStep step={step} user={user} />
    </div>
  )
}

export function DialogStep({ step, user, mascot }) {
  return (
    <div className="space-y-3">
      <StepImage src={step.image} />
      {step.lines.map((line, index) => {
        const student = line.speaker === 'student'
        const narrator = line.speaker === 'narrator'
        if (narrator) {
          return (
            <div key={index} className="text-center text-[0.95em] text-slate-600 italic">
              <Rich text={line.text} user={user} />
            </div>
          )
        }
        return (
          <div key={index} className={`flex items-end gap-2 ${student ? 'flex-row-reverse' : ''}`}>
            {student ? (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                <UserRound className="size-5" aria-hidden="true" />
              </span>
            ) : (
              <Mascot mascot={mascot} mood={line.mood} />
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 leading-relaxed ${
                student
                  ? 'rounded-br-sm bg-sky-50 ring-1 ring-sky-200'
                  : 'rounded-bl-sm bg-white ring-1 ring-slate-200'
              }`}
            >
              {!student && mascot?.name && (
                <p className="text-[0.8em] font-bold text-brand-700">{mascot.name}</p>
              )}
              <Rich text={line.text} user={user} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function driveEmbedUrl(url) {
  const match = /drive\.google\.com\/file\/d\/([\w-]+)/.exec(url)
  return match ? `https://drive.google.com/file/d/${match[1]}/preview` : null
}

export function VideoStep({ step, user }) {
  const base = youtubeEmbedUrl(step.url)
  const embed = base
    ? `${base}${base.includes('?') ? '&' : '?'}start=${Math.floor(step.start || 0)}`
    : driveEmbedUrl(step.url)
  return (
    <div className="space-y-3">
      {embed ? (
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
          <iframe
            src={embed}
            title={step.title || 'Video'}
            className="h-full w-full"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
          />
        </div>
      ) : (
        <a
          href={step.url}
          target="_blank"
          rel="noreferrer"
          className="block rounded-lg bg-brand-50 p-4 text-center font-semibold text-brand-700 ring-1 ring-brand-200"
        >
          Buka video
        </a>
      )}
      <p className="text-[0.8em] text-slate-500">
        Video memakai kuota data. Lewati jika sinyal lemah.
      </p>
      <Rich text={step.body} user={user} />
    </div>
  )
}

/** Tautan ke halaman lain, dibuka di tab baru (noopener agar halaman itu tidak bisa mengendalikan LMS). */
export function LinkStep({ step, user }) {
  let host = ''
  try {
    host = new URL(step.url).hostname.replace(/^www\./, '')
  } catch {
    host = ''
  }
  return (
    <div className="space-y-3">
      <Rich text={step.body} user={user} />
      <a
        href={step.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between gap-3 rounded-lg bg-brand-50 p-4 font-semibold text-brand-800 ring-1 ring-brand-200 hover:bg-brand-100"
      >
        <span className="min-w-0">
          <span className="block">{step.label || 'Buka tautan'}</span>
          {host && (
            <span className="block truncate text-[0.8em] font-normal text-slate-500">{host}</span>
          )}
        </span>
        <ExternalLink className="size-5 shrink-0" aria-hidden="true" />
      </a>
    </div>
  )
}

function FlipCard({ card, user }) {
  const [flipped, setFlipped] = useState(false)
  return (
    <button
      type="button"
      aria-pressed={flipped}
      onClick={() => setFlipped((value) => !value)}
      className={`flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-xl p-4 text-center ring-1 transition motion-reduce:transition-none ${
        flipped ? 'bg-brand-50 ring-brand-300' : 'bg-white ring-slate-300 hover:ring-brand-400'
      }`}
    >
      {!flipped && card.image && (
        <StepImage src={card.image} alt={card.front} className="max-h-36" />
      )}
      <Rich
        text={flipped ? card.back : card.front}
        user={user}
        className={flipped ? '' : 'font-semibold'}
      />
      <span className="flex items-center gap-1 text-[0.75em] text-slate-500">
        <RotateCw className="size-3" aria-hidden="true" />{' '}
        {flipped ? 'Ketuk untuk kembali' : 'Ketuk untuk membalik'}
      </span>
    </button>
  )
}

export function FlipCardsStep({ step, user }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {step.cards.map((card, index) => (
        <FlipCard key={index} card={card} user={user} />
      ))}
    </div>
  )
}

export function FlashcardsStep({ step, user }) {
  const [index, setIndex] = useState(0)
  const card = step.cards[index]
  return (
    <div className="space-y-3">
      <FlipCard key={index} card={card} user={user} />
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="flex min-h-11 items-center gap-1 rounded-lg px-3 ring-1 ring-slate-300 disabled:opacity-40"
        >
          <ChevronLeft className="size-4" aria-hidden="true" /> Sebelumnya
        </button>
        <span className="text-[0.85em] text-slate-500">
          Kartu {index + 1} dari {step.cards.length}
        </span>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(step.cards.length - 1, i + 1))}
          disabled={index === step.cards.length - 1}
          className="flex min-h-11 items-center gap-1 rounded-lg px-3 ring-1 ring-slate-300 disabled:opacity-40"
        >
          Berikutnya <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export function WorkedExampleStep({ step, user }) {
  const [shown, setShown] = useState(1)
  return (
    <div className="space-y-3">
      <Rich text={step.body} user={user} className="font-medium" />
      <ol className="space-y-2">
        {step.steps.slice(0, shown).map((part, index) => (
          <li key={index} className="flex gap-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[0.85em] font-bold text-white">
              {index + 1}
            </span>
            <div className="min-w-0 space-y-1">
              <Rich text={part.text} user={user} />
              {part.explain && (
                <Rich text={part.explain} user={user} className="text-[0.9em] text-slate-600" />
              )}
            </div>
          </li>
        ))}
      </ol>
      {shown < step.steps.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + 1)}
          className="min-h-11 rounded-lg bg-brand-50 px-4 font-semibold text-brand-700 ring-1 ring-brand-200"
        >
          Tampilkan langkah berikutnya ({shown}/{step.steps.length})
        </button>
      )}
    </div>
  )
}
