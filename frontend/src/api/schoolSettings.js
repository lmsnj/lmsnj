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

// --- Tahap 2: kategori mapel & mode kelas ---
export const classModesApi = {
  list: () => api.get('/class-modes/').then((res) => res.data),
  // Khusus Super Admin. Kode tidak bisa diubah; mode tidak bisa dihapus (nonaktifkan saja).
  create: (data) => api.post('/class-modes/', data).then((res) => res.data),
  update: (id, data) => api.patch(`/class-modes/${id}/`, data).then((res) => res.data),
}

export const subjectCategoriesApi = {
  list: () => api.get('/subject-categories/').then((res) => res.data),
  // data: { name, is_active, mode } — mode null = ikut pengaturan sekolah.
  create: (data) => api.post('/subject-categories/', data).then((res) => res.data),
  update: (id, data) => api.patch(`/subject-categories/${id}/`, data).then((res) => res.data),
  remove: (id) => api.delete(`/subject-categories/${id}/`),
  reorder: (ids) =>
    api.post('/subject-categories/reorder/', { categories: ids }).then((res) => res.data),
}

// Kategori & mode per mapel (halaman Kelola Mapel lama tidak diubah).
export const subjectProfilesApi = {
  list: () => api.get('/subject-profiles/').then((res) => res.data),
  // data: { category?, mode? } — field yang tidak dikirim tidak diubah, null = dikosongkan.
  update: (subjectId, data) =>
    api.put(`/subject-profiles/${subjectId}/`, data).then((res) => res.data),
  bulk: (subjectIds, data) =>
    api.post('/subject-profiles/bulk/', { subjects: subjectIds, ...data }).then((res) => res.data),
}
