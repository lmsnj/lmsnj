import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'
import { createExamMonitor } from '../utils/examMonitor'

export function fullscreenSupported() {
  return typeof document !== 'undefined' && Boolean(document.documentElement.requestFullscreen)
}

export function enterFullscreen() {
  if (!fullscreenSupported() || document.fullscreenElement) return
  document.documentElement.requestFullscreen().catch(() => {})
}

export function exitFullscreen() {
  if (typeof document !== 'undefined' && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {})
  }
}

/**
 * Pengawasan saat siswa mengerjakan asesmen.
 *
 * Website TIDAK bisa benar-benar melarang pindah tab/aplikasi (itu kendali browser & sistem
 * operasi). Yang dilakukan hook ini: mendeteksi, memanggil `onViolation(kind)`, meminta konfirmasi
 * saat menutup/refresh tab, dan menahan navigasi di dalam aplikasi (tombol Back).
 *
 * Mengembalikan `blocker` dari React Router untuk ditampilkan sebagai dialog konfirmasi.
 */
export default function useExamGuard({ active, requireFullscreen, onViolation }) {
  const callbackRef = useRef(onViolation)
  useEffect(() => {
    callbackRef.current = onViolation
  })

  useEffect(() => {
    if (!active) return
    return createExamMonitor({
      requireFullscreen,
      onViolation: (kind) => callbackRef.current(kind),
    })
  }, [active, requireFullscreen])

  // Pindah halaman di dalam aplikasi (tombol Back browser, tautan) ditahan dulu.
  return useBlocker(
    ({ currentLocation, nextLocation }) =>
      active && currentLocation.pathname !== nextLocation.pathname,
  )
}
