import api from './client'

// Presensi siswa per pertemuan (sesi mengajar).
export const attendanceApi = {
  // Siswa kelas + status presensi pertemuan ini (status null = belum diisi).
  session: (sessionId) => api.get(`/sessions/${sessionId}/attendance/`).then((res) => res.data),
  // records: [{ student, status: 'H'|'S'|'I'|'A', note }]
  save: (sessionId, records) =>
    api.put(`/sessions/${sessionId}/attendance/`, { records }).then((res) => res.data),
  // params: { classroom } (semua mapel) ATAU { teaching_assignment }, opsional date_from/date_to.
  summary: (params) => api.get('/attendance/summary/', { params }).then((res) => res.data),
  // Siswa: rekap kehadiran sendiri.
  mine: () => api.get('/attendance/me/').then((res) => res.data),
}
