import api from './client'

const base = '/chat/conversations'

export const chatApi = {
  conversations: () => api.get(`${base}/`).then((res) => res.data),
  // Mulai (atau buka kembali) percakapan dengan user lain.
  start: (userId) => api.post(`${base}/`, { user: userId }).then((res) => res.data),
  // afterId: hanya pesan yang lebih baru (untuk pengecekan berkala).
  messages: (id, afterId) =>
    api
      .get(`${base}/${id}/messages/`, { params: afterId ? { after: afterId } : {} })
      .then((res) => res.data),
  send: (id, body) => api.post(`${base}/${id}/messages/`, { body }).then((res) => res.data),
  contacts: (search) =>
    api.get(`${base}/contacts/`, { params: { search } }).then((res) => res.data),
  unreadCount: () => api.get(`${base}/unread-count/`).then((res) => res.data.unread),
}
