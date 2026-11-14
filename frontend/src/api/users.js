import api from './client'

export const usersApi = {
  list: (params) => api.get('/users/', { params }).then((res) => res.data),
  create: (data) => api.post('/users/', data).then((res) => res.data),
  update: (id, data) => api.patch(`/users/${id}/`, data).then((res) => res.data),
  remove: (id) => api.delete(`/users/${id}/`),
  // Daftarkan akun guru/admin yang sudah ada (dari sekolah lain) ke sekolah yang sedang dibuka.
  join: (username) => api.post('/users/join/', { username }).then((res) => res.data),
  // newPassword kosong = dibuat otomatis; respons berisi `password` (sekali) dan `account` (kartu).
  resetPassword: (id, newPassword) =>
    api.post(`/users/${id}/reset-password/`, { new_password: newPassword }).then((res) => res.data),
  // Kartu akun: { user_ids | classroom | role, reset_password } -> { school, accounts }.
  accountCards: (data) => api.post('/users/account-cards/', data).then((res) => res.data),

  // Impor dari Excel: dryRun=true hanya memeriksa, dryRun=false menyimpan (jika semua baris benar).
  importTemplate: () =>
    api.get('/users/import-template/', { responseType: 'blob' }).then((res) => res.data),
  importFile: (file, dryRun) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('dry_run', dryRun ? 'true' : 'false')
    return api.post('/users/import/', formData).then((res) => res.data)
  },

  // Perbarui NIS/NIP/kode guru akun yang sudah ada (role: 'student' | 'teacher').
  updateTemplate: (role, onlyMissing) =>
    api
      .get('/users/update-template/', {
        params: { role, kosong: onlyMissing ? 1 : 0 },
        responseType: 'blob',
      })
      .then((res) => res.data),
  updateFile: (file, role, dryRun) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('role', role)
    formData.append('dry_run', dryRun ? 'true' : 'false')
    return api.post('/users/update-import/', formData).then((res) => res.data)
  },
}
