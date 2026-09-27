import api from './client'

export const announcementsApi = {
  // teaching_assignment: id kelas-mapel, atau 'school' untuk pengumuman seluruh sekolah.
  list: (params) => api.get('/announcements/', { params }).then((res) => res.data),
  create: (data) => api.post('/announcements/', data).then((res) => res.data),
  update: (id, data) => api.patch(`/announcements/${id}/`, data).then((res) => res.data),
  remove: (id) => api.delete(`/announcements/${id}/`),
}
