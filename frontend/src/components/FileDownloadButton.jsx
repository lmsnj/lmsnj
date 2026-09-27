import { useState } from 'react'
import { saveBlob } from '../utils/media'
import Button from './Button'

// Tombol unduh untuk file yang diambil lewat API (butuh token), bukan link biasa.
// `onDownloaded` (opsional) dipanggil setelah unduhan berhasil dimulai.
export default function FileDownloadButton({
  fetchBlob,
  filename,
  onDownloaded,
  children,
  ...props
}) {
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    setFailed(false)
    try {
      const blob = await fetchBlob()
      const url = URL.createObjectURL(blob)
      saveBlob(url, filename)
      onDownloaded?.()
      // Beri waktu browser memulai unduhan sebelum memori dibebaskan.
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="secondary" size="sm" loading={loading} onClick={handleClick} {...props}>
      {failed ? 'Gagal, coba lagi' : (children ?? `Unduh ${filename}`)}
    </Button>
  )
}
