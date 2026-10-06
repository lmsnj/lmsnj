import api from './client'
import { requestBody } from './upload'

export const schoolsApi = {
  // Sekolah yang boleh dibuka user (admin yayasan: semua, termasuk yang nonaktif).
  list: () => api.get('/schools/').then((res) => res.data),
  // Admin yayasan: jumlah siswa, guru, kelas, materi, tugas per sekolah.
  summary: () => api.get('/schools/summary/').then((res) => res.data),
  // { code, name, level, slogan, is_active, logo (File), remove_logo }
  create: (data) => api.post('/schools/', requestBody(data)).then((res) => res.data),
  // Admin sekolah hanya bisa mengubah name, slogan, logo.
  update: (id, data) => api.patch(`/schools/${id}/`, requestBody(data)).then((res) => res.data),
  remove: (id) => api.delete(`/schools/${id}/`),
}
