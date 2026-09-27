import api from './client'

// Isi dashboard menyesuaikan peran user yang login.
export const dashboardApi = {
  get: () => api.get('/dashboard/').then((res) => res.data),
}
