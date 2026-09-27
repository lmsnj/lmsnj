import api from './client'

export const usersApi = {
  list: (params) => api.get('/users/', { params }).then((res) => res.data),
  create: (data) => api.post('/users/', data).then((res) => res.data),
  update: (id, data) => api.patch(`/users/${id}/`, data).then((res) => res.data),
  remove: (id) => api.delete(`/users/${id}/`),
  resetPassword: (id, newPassword) =>
    api.post(`/users/${id}/reset-password/`, { new_password: newPassword }).then((res) => res.data),

  // Impor dari Excel: dryRun=true hanya memeriksa, dryRun=false menyimpan (jika semua baris benar).
  importTemplate: () =>
    api.get('/users/import-template/', { responseType: 'blob' }).then((res) => res.data),
  importFile: (file, dryRun) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('dry_run', dryRun ? 'true' : 'false')
    return api.post('/users/import/', formData).then((res) => res.data)
  },
}
