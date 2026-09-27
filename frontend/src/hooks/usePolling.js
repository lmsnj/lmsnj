import { useEffect, useRef } from 'react'

/**
 * Menjalankan `callback` setiap `intervalMs` selama tab browser sedang dilihat.
 * Dipakai Ruang Obrolan untuk mengecek pesan baru tanpa server real-time.
 */
export default function usePolling(callback, intervalMs, enabled = true) {
  const callbackRef = useRef(callback)
  useEffect(() => {
    callbackRef.current = callback
  })

  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => {
      if (!document.hidden) callbackRef.current()
    }, intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs, enabled])
}
