import api from './client'

// Penilaian langsung (Mapel Umum Tahap 3, apps/grading di backend).
export const gradeTypesApi = {
  list: () => api.get('/grade-types/').then((res) => res.data),
  create: (data) => api.post('/grade-types/', data).then((res) => res.data),
  update: (id, data) => api.patch(`/grade-types/${id}/`, data).then((res) => res.data),
  remove: (id) => api.delete(`/grade-types/${id}/`),
  reorder: (ids) => api.post('/grade-types/reorder/', { grade_types: ids }).then((res) => res.data),
  // Buat jenis awal (Tugas Kertas, Ulangan Kertas, Lisan, ...) jika sekolah belum punya.
  starter: () => api.post('/grade-types/starter/').then((res) => res.data),
}

export const gradeActivitiesApi = {
  list: (params) => api.get('/grade-activities/', { params }).then((res) => res.data),
  create: (data) => api.post('/grade-activities/', data).then((res) => res.data),
  update: (id, data) => api.patch(`/grade-activities/${id}/`, data).then((res) => res.data),
  remove: (id) => api.delete(`/grade-activities/${id}/`),
  // { activity, kkm, rows: [{ student, full_name, nis, value, score, status, note, below_kkm }] }
  scores: (id) => api.get(`/grade-activities/${id}/scores/`).then((res) => res.data),
  // records: [{ student, value, status, note }] — hanya sel yang berubah.
  saveScores: (id, records) =>
    api.put(`/grade-activities/${id}/scores/`, { records }).then((res) => res.data),
}
