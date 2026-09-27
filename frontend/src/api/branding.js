import api from './client'
import { requestBody } from './upload'

export const brandingApi = {
  // Publik: dipakai juga di halaman login.
  get: () => api.get('/branding/').then((res) => res.data),
  // Admin: { school_name, slogan, app_name, logo (File), remove_logo }
  update: (data) => api.patch('/branding/', requestBody(data)).then((res) => res.data),
}
