import { useCallback, useEffect, useRef, useState } from 'react'
import { chatApi } from '../api/chat'
import { newMessageNotices, unreadConversations } from '../utils/chatNotices'
import usePolling from './usePolling'

const POLL_MS = 15000
const TOAST_MS = 8000

/**
 * Pesan obrolan yang belum dibaca, dicek tiap 15 detik (tanpa WebSocket).
 * Yang dicek berkala hanya JUMLAH pesan belum dibaca (ringan); daftar percakapan baru diambil
 * jika jumlahnya berubah. Mengembalikan:
 * - `unread`: jumlah pesan belum dibaca (badge menu Ruang Obrolan)
 * - `conversations`: percakapan yang belum dibaca (isi lonceng pemberitahuan)
 * - `toasts` + `dismiss`: pemberitahuan melayang untuk pesan yang baru masuk
 */
export default function useChatNotifications({ showToasts = true } = {}) {
  const [unread, setUnread] = useState(0)
  const [conversations, setConversations] = useState([])
  const [toasts, setToasts] = useState([])
  // Disimpan di ref (bukan state) karena hanya dipakai pembanding antar-pengecekan.
  const snapshot = useRef(null)
  const lastCount = useRef(null)
  const showRef = useRef(showToasts)
  useEffect(() => {
    showRef.current = showToasts
  })

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const loadConversations = useCallback(async () => {
    const list = await chatApi.conversations()
    const fresh = newMessageNotices(snapshot.current, list)
    snapshot.current = list
    setConversations(unreadConversations(list))
    if (fresh.length && showRef.current) {
      setToasts((current) => [
        ...current.filter((t) => !fresh.some((c) => c.id === t.id)),
        ...fresh.map((c) => ({ ...c, shownAt: Date.now() })),
      ])
    }
  }, [])

  const check = useCallback(async () => {
    try {
      const count = await chatApi.unreadCount()
      setUnread(count)
      // Pengecekan pertama selalu memuat daftar (sebagai pembanding), berikutnya hanya jika berubah.
      if (count !== lastCount.current) {
        lastCount.current = count
        await loadConversations()
      }
    } catch {
      // Gagal memeriksa pesan tidak boleh mengganggu halaman; dicoba lagi di pengecekan berikutnya.
    }
  }, [loadConversations])

  usePolling(check, POLL_MS, true, true)

  // Pemberitahuan melayang hilang sendiri setelah beberapa detik (dijadwalkan untuk yang paling lama).
  useEffect(() => {
    if (!toasts.length) return
    const oldest = Math.min(...toasts.map((t) => t.shownAt))
    const timer = setTimeout(
      // Toleransi 50 ms: timer browser bisa berbunyi sedikit lebih awal.
      () => setToasts((list) => list.filter((t) => Date.now() - t.shownAt < TOAST_MS - 50)),
      Math.max(0, oldest + TOAST_MS - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [toasts])

  return { unread, conversations, toasts, dismiss, refresh: check }
}
