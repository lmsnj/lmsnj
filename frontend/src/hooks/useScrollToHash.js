import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// React Router tidak otomatis menggulir ke #id pada alamat (mis. /profil#ganti-password).
// `ready` = true setelah elemen tujuannya sudah tampil (mis. setelah data selesai dimuat).
// `key` ikut dipantau: setiap klik tautan membuat key baru, jadi klik ulang tautan ke #id yang
// SAMA (alamat tidak berubah) tetap menggulir.
export default function useScrollToHash(ready = true) {
  const { hash, key } = useLocation()
  useEffect(() => {
    if (!hash || !ready) return
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash, key, ready])
}
