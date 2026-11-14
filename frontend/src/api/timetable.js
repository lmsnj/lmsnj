import api from './client'

// Jadwal pelajaran mingguan yang aktif (isi menyesuaikan peran pengguna).
export const timetableApi = {
  get: (params) => api.get('/timetable/', { params }).then((res) => res.data),
  teacherLoads: () => api.get('/timetable/teacher-loads/').then((res) => res.data),
  // Impor dari Excel (admin): dryRun = hanya diperiksa, tidak ada yang disimpan.
  importTemplate: () =>
    api.get('/timetable/import-template/', { responseType: 'blob' }).then((res) => res.data),
  importRun: (file, dryRun) => {
    const form = new FormData()
    form.append('file', file)
    form.append('dry_run', dryRun ? 'true' : 'false')
    return api.post('/timetable/import/', form).then((res) => res.data)
  },
}
