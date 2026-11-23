import api from './client'

// Isi dashboard menyesuaikan peran user yang login.
export const dashboardApi = {
  get: () => api.get('/dashboard/').then((res) => res.data),
  // Data grafik Statistik Sekolah (admin, sekolah yang sedang dibuka).
  statistics: () => api.get('/dashboard/statistics/').then((res) => res.data),
}
