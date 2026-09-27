import { ImageOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import api from '../api/client'

// Gambar yang sudah diunduh disimpan selama halaman terbuka agar tidak diunduh ulang.
const cache = new Map()

function load(url) {
  if (!cache.has(url)) {
    const promise = api
      .get(url, { responseType: 'blob' })
      .then((res) => URL.createObjectURL(res.data))
      .catch((error) => {
        cache.delete(url) // gagal: boleh dicoba lagi nanti
        throw error
      })
    cache.set(url, promise)
  }
  return cache.get(url)
}

/**
 * Gambar yang hanya bisa diambil lewat API (butuh token login), mis. gambar soal asesmen.
 * `url` relatif terhadap API, contoh: "/assessment-images/5/".
 */
export default function AuthImage({ url, alt, className = '' }) {
  const [state, setState] = useState({ url: null, src: null, failed: false })

  useEffect(() => {
    let ignore = false
    load(url)
      .then((src) => !ignore && setState({ url, src, failed: false }))
      .catch(() => !ignore && setState({ url, src: null, failed: true }))
    return () => {
      ignore = true
    }
  }, [url])

  if (state.url === url && state.failed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500">
        <ImageOff className="size-4" aria-hidden="true" /> Gambar gagal dimuat
      </span>
    )
  }
  if (state.url !== url || !state.src) {
    return (
      <span
        className={`block animate-pulse rounded-lg bg-slate-100 ${className} min-h-24 min-w-32`}
      />
    )
  }
  return <img src={state.src} alt={alt} className={`rounded-lg ${className}`} draggable={false} />
}
