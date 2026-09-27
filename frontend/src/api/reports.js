import api from './client'

// Laporan rekap nilai per kelas (admin & wali kelas).
export const reportsApi = {
  classroom: (id) => api.get(`/reports/classrooms/${id}/`).then((res) => res.data),
  classroomCsv: (id) =>
    api.get(`/reports/classrooms/${id}/export/`, { responseType: 'blob' }).then((res) => res.data),
}
