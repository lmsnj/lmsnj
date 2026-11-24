import { ExternalLink, FileText, Flag, Link2, PlayCircle, Target } from 'lucide-react'
import { useEffect, useState } from 'react'
import { materialItemsApi, materialsApi } from '../../api/materials'
import { youtubeEmbedUrl } from '../../utils/media'
import Spinner from '../Spinner'

const TYPE_ICONS = { pdf: FileText, video: PlayCircle, link: Link2 }

function muted(dark) {
  return dark ? 'text-slate-300' : 'text-slate-600'
}

// Slide pembuka: mapel & kelas, judul, deskripsi, capaian ("Yang akan dipelajari").
export function TitleSlide({ material, dark }) {
  const objectives = material.objectives ?? []
  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center px-8 py-10">
      <p className={`text-lg font-semibold ${dark ? 'text-brand-300' : 'text-brand-700'}`}>
        {[material.subject_name, material.classroom_name, material.chapter_title]
          .filter(Boolean)
          .join(' • ')}
      </p>
      <h1 className="mt-2 text-5xl leading-tight font-bold">{material.title}</h1>
      {material.description && (
        <p className={`mt-4 text-2xl whitespace-pre-line ${muted(dark)}`}>{material.description}</p>
      )}
      {objectives.length > 0 && (
        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <Target className="size-7 text-brand-500" aria-hidden="true" /> Yang akan dipelajari
          </h2>
          <ol className="mt-3 space-y-2 text-2xl">
            {objectives.map((objective, index) => (
              <li key={index} className="flex gap-3">
                <span className="font-bold text-brand-500">{index + 1}.</span>
                <span>{objective}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

function PdfSlide({ slide, material, dark }) {
  const [state, setState] = useState({ url: null, error: '' })
  const itemId = slide.item?.id

  useEffect(() => {
    let url = null
    let ignore = false
    const load = itemId ? materialItemsApi.download(itemId) : materialsApi.download(material.id)
    load
      .then((blob) => {
        url = URL.createObjectURL(blob)
        if (ignore) URL.revokeObjectURL(url)
        else setState({ url, error: '' })
      })
      .catch(() => !ignore && setState({ url: null, error: 'Gagal memuat file PDF.' }))
    return () => {
      ignore = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [itemId, material.id])

  if (state.error) return <p className="p-10 text-center text-2xl text-red-400">{state.error}</p>
  if (!state.url) {
    return (
      <div className={`flex h-full items-center justify-center ${muted(dark)}`}>
        <Spinner className="size-10" />
      </div>
    )
  }
  // Klik di dalam PDF lalu gulir; panah/PageDown di dalam PDF menggulir halaman PDF.
  return <iframe src={state.url} title={slide.title} className="h-full w-full bg-white" />
}

function VideoSlide({ slide, dark }) {
  const url = (slide.item ?? slide.material).url
  const embedUrl = youtubeEmbedUrl(url)
  if (!embedUrl) return <LinkSlide slide={slide} dark={dark} label="Buka Video" />
  return (
    <div className="flex h-full items-center justify-center bg-black p-2">
      <iframe
        src={embedUrl}
        title={slide.title}
        className="aspect-video max-h-full w-full max-w-[calc((100vh-6rem)*16/9)]"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  )
}

function LinkSlide({ slide, dark, label = 'Buka Tautan' }) {
  const url = (slide.item ?? slide.material).url
  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col items-center justify-center px-8 py-10 text-center">
      <Link2 className="size-16 text-brand-500" aria-hidden="true" />
      <h2 className="mt-4 text-4xl font-bold">{slide.title}</h2>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-xl font-semibold text-white hover:bg-brand-700"
      >
        <ExternalLink className="size-6" aria-hidden="true" /> {label}
      </a>
      <p className={`mt-4 text-lg break-all ${muted(dark)}`}>{url}</p>
    </div>
  )
}

// Satu konten materi (utama atau tambahan). Judul kecil di atas, isi memenuhi layar.
export function ContentSlide({ slide, material, dark }) {
  const Icon = TYPE_ICONS[slide.type] ?? FileText
  const withMaterial = { ...slide, material }
  return (
    <div className="flex h-full flex-col">
      <h2 className="flex items-center gap-2 px-6 py-3 text-xl font-semibold">
        <Icon className="size-6 shrink-0 text-brand-500" aria-hidden="true" />
        <span className="truncate">{slide.title}</span>
      </h2>
      <div className="min-h-0 flex-1">
        {slide.type === 'pdf' ? (
          <PdfSlide slide={slide} material={material} dark={dark} />
        ) : slide.type === 'video' ? (
          <VideoSlide slide={withMaterial} dark={dark} />
        ) : (
          <LinkSlide slide={withMaterial} dark={dark} />
        )}
      </div>
    </div>
  )
}

// Slide penutup: tindak lanjut (tugas/asesmen syarat materi) bila ada.
export function EndSlide({ material, dark }) {
  const followUps = [
    material.required_task_title && `Tugas: ${material.required_task_title}`,
    material.required_assessment_title && `Asesmen: ${material.required_assessment_title}`,
  ].filter(Boolean)
  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col items-center justify-center px-8 py-10 text-center">
      <Flag className="size-16 text-brand-500" aria-hidden="true" />
      <h2 className="mt-4 text-5xl font-bold">Selesai</h2>
      <p className={`mt-3 text-2xl ${muted(dark)}`}>{material.title}</p>
      <p className="mt-6 text-3xl font-semibold">Ada pertanyaan?</p>
      {followUps.length > 0 && (
        <ul className={`mt-8 space-y-2 text-2xl ${muted(dark)}`}>
          {followUps.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
