import api from './client'
import { requestBody, uploadConfig } from './upload'

export const materialsApi = {
  list: (params) => api.get('/materials/', { params }).then((res) => res.data),
  create: (data, onProgress) =>
    api.post('/materials/', requestBody(data), uploadConfig(onProgress)).then((res) => res.data),
  update: (id, data, onProgress) =>
    api
      .patch(`/materials/${id}/`, requestBody(data), uploadConfig(onProgress))
      .then((res) => res.data),
  remove: (id) => api.delete(`/materials/${id}/`),
  // File diambil lewat API (dengan token), bukan lewat URL publik.
  download: (id) =>
    api.get(`/materials/${id}/download/`, { responseType: 'blob' }).then((res) => res.data),

  // Capaian materi. Siswa: tandai dibuka & centang capaian (mengembalikan materi terbaru).
  open: (id) => api.post(`/materials/${id}/open/`).then((res) => res.data),
  checkObjectives: (id, checked) =>
    api.post(`/materials/${id}/objectives/`, { checked }).then((res) => res.data),
  // Guru: progres semua siswa; records: [{ student, teacher_approved?, unlocked?, note? }].
  progress: (id) => api.get(`/materials/${id}/progress/`).then((res) => res.data),
  saveProgress: (id, records) =>
    api.put(`/materials/${id}/progress/`, { records }).then((res) => res.data),
  reorder: (teachingAssignment, materialIds) =>
    api
      .post('/materials/reorder/', {
        teaching_assignment: teachingAssignment,
        materials: materialIds,
      })
      .then((res) => res.data),
}
