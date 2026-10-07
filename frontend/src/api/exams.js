import api from './client'

// Acara ujian & syarat kartu ujian. Admin: semua; wali kelas: kelas yang ia walikan.
export const examsApi = {
  list: (params) => api.get('/exam-events/', { params }).then((res) => res.data),
  get: (id) => api.get(`/exam-events/${id}/`).then((res) => res.data),
  create: (data) => api.post('/exam-events/', data).then((res) => res.data),
  update: (id, data) => api.patch(`/exam-events/${id}/`, data).then((res) => res.data),
  remove: (id) => api.delete(`/exam-events/${id}/`),
  // Kelas yang ikut acara (wali kelas: kelasnya saja).
  classrooms: (id) => api.get(`/exam-events/${id}/classrooms/`).then((res) => res.data),
  // Status syarat setiap siswa di satu kelas.
  eligibility: ({ id, classroom }) =>
    api.get(`/exam-events/${id}/eligibility/`, { params: { classroom } }).then((res) => res.data),
  // records: [{ student, homeroom_checked?, exempted?, exemption_reason?, room? }]
  // Wali kelas hanya boleh mengirim homeroom_checked.
  saveEligibility: (id, classroom, records) =>
    api.put(`/exam-events/${id}/eligibility/`, { classroom, records }).then((res) => res.data),
  // Admin: token baru untuk kartu yang hilang (kartu lama tidak berlaku).
  resetToken: (id, classroom, student) =>
    api.post(`/exam-events/${id}/reset-token/`, { classroom, student }).then((res) => res.data),
  // Data kartu siswa yang layak (memenuhi syarat atau dikecualikan).
  cards: ({ id, classroom }) =>
    api.get(`/exam-events/${id}/cards/`, { params: { classroom } }).then((res) => res.data),
}
