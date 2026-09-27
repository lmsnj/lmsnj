import api from './client'

const get = (url, params) => api.get(url, { params }).then((res) => res.data)
const post = (url, data) => api.post(url, data).then((res) => res.data)
const patch = (url, data) => api.patch(url, data).then((res) => res.data)

export const assessmentsApi = {
  list: (params) => get('/assessments/', params),
  get: (id) => get(`/assessments/${id}/`),
  create: (data) => post('/assessments/', data),
  update: (id, data) => patch(`/assessments/${id}/`, data),
  remove: (id) => api.delete(`/assessments/${id}/`),

  // Guru: soal lengkap dengan kunci jawaban, rekap hasil.
  questions: (id) => get(`/assessments/${id}/questions/`),
  results: (id) => get(`/assessments/${id}/results/`),

  // Siswa: mulai/lanjutkan, kumpulkan, lihat hasil.
  start: (id) => post(`/assessments/${id}/start/`),
  submit: (id, answers) => post(`/assessments/${id}/submit/`, { answers }),
  myAttempt: (id) => get(`/assessments/${id}/my-attempt/`),
  // Pengawasan: simpan jawaban sementara & catat keluar dari halaman ujian.
  saveDraft: (id, answers) => post(`/assessments/${id}/draft/`, { answers }),
  violation: (id, kind) => post(`/assessments/${id}/violation/`, { kind }),
}

export const questionsApi = {
  create: (data) => post('/assessment-questions/', data),
  update: (id, data) => patch(`/assessment-questions/${id}/`, data),
  remove: (id) => api.delete(`/assessment-questions/${id}/`),
}

export const attemptsApi = {
  get: (id) => get(`/assessment-attempts/${id}/`),
  grade: (id, grades) => patch(`/assessment-attempts/${id}/grade/`, { grades }),
}
