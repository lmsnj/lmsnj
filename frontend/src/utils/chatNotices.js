// Fungsi murni untuk pemberitahuan pesan baru (dipakai hooks/useChatNotifications.js; ada test-nya).

/** Percakapan yang punya pesan belum dibaca, terbaru di atas (urutan dari API). */
export function unreadConversations(conversations) {
  return conversations.filter((conversation) => conversation.unread > 0)
}

/**
 * Percakapan yang pesan belum dibacanya BERTAMBAH dibanding pengecekan sebelumnya — inilah yang
 * dimunculkan sebagai pemberitahuan. `previous` = null berarti pengecekan pertama (belum ada
 * pembanding), jadi pesan lama tidak dimunculkan ulang setiap kali halaman dibuka.
 */
export function newMessageNotices(previous, current) {
  if (!previous) return []
  const before = new Map(previous.map((conversation) => [conversation.id, conversation.unread]))
  return current.filter((conversation) => conversation.unread > (before.get(conversation.id) ?? 0))
}

/** Potongan isi pesan untuk pemberitahuan (satu baris, maks. `max` karakter). */
export function previewText(text, max = 80) {
  const line = (text ?? '').replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}
