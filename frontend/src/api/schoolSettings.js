import api from './client'

// Pengaturan Pembelajaran & saklar fitur sekolah aktif (apps/school_settings di backend).
// scope: 'school' | 'subject' | 'classroom' (kategori mapel menyusul di Tahap 2).
const scopeParams = ({ scope = 'school', scopeId = null } = {}) =>
  scope === 'school' ? { scope } : { scope, scope_id: scopeId }

export const schoolSettingsApi = {
  // Admin: semua pengaturan di satu cakupan (bawaan, nilai tersimpan, nilai berlaku).
  list: (target) =>
    api.get('/school-settings/', { params: scopeParams(target) }).then((res) => res.data),
  save: (key, target, value) =>
    api.put(`/school-settings/${key}/`, { ...scopeParams(target), value }).then((res) => res.data),
  // Kembalikan ke bawaan di cakupan itu.
  reset: (key, target) =>
    api.delete(`/school-settings/${key}/`, { params: scopeParams(target) }).then((res) => res.data),
  history: (params) => api.get('/school-settings/history/', { params }).then((res) => res.data),
  // Semua pengguna login: { values: {key: nilai}, features: {kode: aktif} }.
  effective: (params) => api.get('/school-settings/effective/', { params }).then((res) => res.data),
  features: () => api.get('/school-features/').then((res) => res.data),
  // Khusus Super Admin.
  setFeature: (code, isActive) =>
    api.put(`/school-features/${code}/`, { is_active: isActive }).then((res) => res.data),
}
