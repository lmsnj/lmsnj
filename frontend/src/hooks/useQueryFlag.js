import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Membaca penanda sekali-pakai dari alamat, mis. /guru/materi?baru=1 dari tombol Beranda.
 * Nilainya diambil saat halaman dibuka, lalu dihapus dari alamat agar tidak terpicu lagi
 * saat halaman di-refresh.
 */
export default function useQueryFlag(name) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [value] = useState(() => searchParams.get(name))

  useEffect(() => {
    if (value === null) return
    setSearchParams(
      (params) => {
        params.delete(name)
        return params
      },
      { replace: true },
    )
  }, [name, value, setSearchParams])

  return value
}
