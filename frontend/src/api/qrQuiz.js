import api from './client'

// Kuis Kartu QR (Mapel Umum Tahap 5, apps/qr_quiz di backend).
export const qrCardsApi = {
  // { classroom, classroom_name, card_limit, rows: [{ student, full_name, nis, number }] }
  get: (classroom) => api.get('/qr-quiz/cards/', { params: { classroom } }).then((res) => res.data),
  // records: [{ student, number | null }] — mengganti seluruh peta kartu kelas.
  save: (classroom, records) =>
    api.put('/qr-quiz/cards/', { classroom, records }).then((res) => res.data),
  auto: (classroom) => api.post('/qr-quiz/cards/auto/', { classroom }).then((res) => res.data),
}

export const qrQuizApi = {
  list: (params) => api.get('/qr-quiz/sessions/', { params }).then((res) => res.data),
  // Detail berisi questions, roster (peta kartu), answers, options — dibaca berkala oleh TV & pemindai.
  get: (id) => api.get(`/qr-quiz/sessions/${id}/`).then((res) => res.data),
  create: (data) => api.post('/qr-quiz/sessions/', data).then((res) => res.data),
  update: (id, data) => api.patch(`/qr-quiz/sessions/${id}/`, data).then((res) => res.data),
  remove: (id) => api.delete(`/qr-quiz/sessions/${id}/`),
  // { question?, revealed? }: soal yang tampil di TV / tampilkan hasil.
  control: (id, data) => api.post(`/qr-quiz/sessions/${id}/control/`, data).then((res) => res.data),
  // scans: [{ card, option }] -> { report: { saved, unknown_cards, invalid_cards, kept_cards }, session }
  scans: (id, question, scans) =>
    api.post(`/qr-quiz/sessions/${id}/scans/`, { question, scans }).then((res) => res.data),
  finish: (id) => api.post(`/qr-quiz/sessions/${id}/finish/`).then((res) => res.data),
  // { option_limit, questions: [{ id, assessment, text, choices, correct }] }
  bank: (teachingAssignment) =>
    api
      .get('/qr-quiz/sessions/bank/', { params: { teaching_assignment: teachingAssignment } })
      .then((res) => res.data),
}
