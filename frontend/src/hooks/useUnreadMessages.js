import { useEffect, useState } from 'react'
import { chatApi } from '../api/chat'
import usePolling from './usePolling'

const POLL_MS = 30000

// Jumlah pesan belum dibaca untuk badge menu "Ruang Obrolan" (dicek tiap 30 detik).
export default function useUnreadMessages() {
  const [count, setCount] = useState(0)
  const refresh = () =>
    chatApi
      .unreadCount()
      .then(setCount)
      .catch(() => {})

  useEffect(() => {
    let ignore = false
    chatApi
      .unreadCount()
      .then((value) => !ignore && setCount(value))
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [])
  usePolling(refresh, POLL_MS)
  return count
}
