import { useEffect, useState } from 'react'
import { loadAuthImage } from '../api/images'

const ASSET = /^asset:(\d+)$/

/**
 * Alamat gambar yang bisa dipakai di <img>: https apa adanya, "asset:<id>" diunduh lewat API (dengan
 * token) lalu dijadikan blob URL. Mengembalikan { src, failed }.
 */
export default function useImageSrc(value) {
  const match = ASSET.exec(value || '')
  const direct = !match && /^https?:\/\//.test(value || '') ? value : null
  const [state, setState] = useState({ key: null, src: null, failed: false })

  useEffect(() => {
    if (!match) return
    let ignore = false
    loadAuthImage(`/media-assets/${match[1]}/`)
      .then((src) => !ignore && setState({ key: value, src, failed: false }))
      .catch(() => !ignore && setState({ key: value, src: null, failed: true }))
    return () => {
      ignore = true
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps -- match turunan dari value

  if (direct) return { src: direct, failed: false }
  if (match && state.key === value) return { src: state.src, failed: state.failed }
  return { src: null, failed: false }
}
