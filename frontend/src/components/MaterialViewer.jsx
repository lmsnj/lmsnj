import { useEffect, useState } from 'react'
import { materialsApi } from '../api/materials'
import { saveBlob, youtubeEmbedUrl } from '../utils/media'
import Alert from './Alert'
import Button from './Button'
import Modal from './Modal'
import Spinner from './Spinner'

function PdfViewer({ material }) {
  const [state, setState] = useState({ blobUrl: null, error: '' })

  useEffect(() => {
    let blobUrl = null
    let ignore = false
    materialsApi
      .download(material.id)
      .then((blob) => {
        blobUrl = URL.createObjectURL(blob)
        if (ignore) URL.revokeObjectURL(blobUrl)
        else setState({ blobUrl, error: '' })
      })
      .catch(() => !ignore && setState({ blobUrl: null, error: 'Gagal memuat file PDF.' }))
    return () => {
      ignore = true
      // Bebaskan memori browser saat penampil ditutup.
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [material.id])

  if (state.error) return <Alert type="error">{state.error}</Alert>
  if (!state.blobUrl) {
    return (
      <div className="py-16 text-center text-brand-600">
        <Spinner className="size-8" />
        <p className="mt-2 text-sm text-slate-500">Memuat PDF...</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => window.open(state.blobUrl, '_blank', 'noopener')}>
          Buka di Tab Baru
        </Button>
        <Button
          variant="secondary"
          onClick={() => saveBlob(state.blobUrl, material.original_filename || 'materi.pdf')}
        >
          Unduh
        </Button>
      </div>
      {/* Beberapa browser HP tidak bisa menampilkan PDF di dalam halaman; gunakan tombol di atas. */}
      <iframe
        src={state.blobUrl}
        title={material.title}
        className="hidden h-[65vh] w-full rounded-lg ring-1 ring-slate-200 sm:block"
      />
    </div>
  )
}

function ExternalLink({ url, label }) {
  return (
    <div className="space-y-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        {label}
      </a>
      <p className="text-xs break-all text-slate-500">{url}</p>
    </div>
  )
}

function VideoViewer({ material }) {
  const embedUrl = youtubeEmbedUrl(material.url)
  if (!embedUrl) return <ExternalLink url={material.url} label="Tonton Video" />
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
      <iframe
        src={embedUrl}
        title={material.title}
        className="h-full w-full"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  )
}

// Penampil materi dalam modal. Dipakai guru maupun siswa.
export default function MaterialViewer({ material, onClose }) {
  if (!material) return null
  return (
    <Modal open title={material.title} onClose={onClose} size="lg">
      <div className="space-y-4">
        {material.description && (
          <p className="text-sm whitespace-pre-line text-slate-700">{material.description}</p>
        )}
        {material.material_type === 'pdf' && <PdfViewer material={material} />}
        {material.material_type === 'video' && <VideoViewer material={material} />}
        {material.material_type === 'link' && (
          <ExternalLink url={material.url} label="Buka Link Materi" />
        )}
      </div>
    </Modal>
  )
}
