import { useCallback, useEffect, useRef, useState } from 'react'
import { qrQuizApi } from '../api/qrQuiz'
import { getErrorMessage } from '../utils/errors'

const POLL_MS = 2000

/**
 * Sesi kuis QR yang dibaca ulang tiap 2 detik (layar TV & pemindai HP dibuka di perangkat berbeda;
 * sengaja polling, bukan WebSocket). Berhenti saat tab tidak terlihat. `setSession` = pakai data
 * terbaru dari respons aksi (pindah soal, simpan pindaian) tanpa menunggu polling berikutnya.
 */
export default function useQuizSession(id) {
  const [session, setSessionState] = useState(null)
  const [error, setError] = useState('')
  const version = useRef(0)

  const setSession = useCallback((data) => {
    version.current += 1 // respons polling yang sedang berjalan lebih lama dari data ini
    setSessionState(data)
  }, [])

  useEffect(() => {
    let stopped = false
    let timeout
    const load = async () => {
      const started = version.current
      if (!document.hidden) {
        try {
          const data = await qrQuizApi.get(id)
          if (!stopped && started === version.current) {
            setSessionState(data)
            setError('')
          }
        } catch (err) {
          if (!stopped) setError(getErrorMessage(err))
        }
      }
      if (!stopped) timeout = setTimeout(load, POLL_MS)
    }
    load()
    return () => {
      stopped = true
      clearTimeout(timeout)
    }
  }, [id])

  return { session, error, setSession }
}
