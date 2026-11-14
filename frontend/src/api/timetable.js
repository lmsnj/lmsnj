import api from './client'

// Jadwal pelajaran mingguan yang aktif (isi menyesuaikan peran pengguna).
export const timetableApi = {
  get: (params) => api.get('/timetable/', { params }).then((res) => res.data),
  teacherLoads: () => api.get('/timetable/teacher-loads/').then((res) => res.data),
}
