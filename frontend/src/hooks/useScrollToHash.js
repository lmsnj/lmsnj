import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// React Router tidak otomatis menggulir ke #id pada alamat (mis. /profil#ganti-password).
// `ready` = true setelah elemen tujuannya sudah tampil (mis. setelah data selesai dimuat).
export default function useScrollToHash(ready = true) {
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash || !ready) return
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash, ready])
}
