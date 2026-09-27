import api from './client'

// Jadwal sesi mengajar (tatap muka / online).
export const sessionsApi = {
  list: (params) => api.get('/sessions/', { params }).then((res) => res.data),
  create: (data) => api.post('/sessions/', data).then((res) => res.data),
  update: (id, data) => api.patch(`/sessions/${id}/`, data).then((res) => res.data),
  remove: (id) => api.delete(`/sessions/${id}/`),
}
