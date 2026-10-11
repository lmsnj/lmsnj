import api from './client'

export const authApi = {
  login: (username, password) =>
    api.post('/auth/login/', { username, password }).then((res) => res.data),
  logout: (refresh) => api.post('/auth/logout/', { refresh }),
  me: () => api.get('/auth/me/').then((res) => res.data),
  // Admin yayasan: daftar akun yang bisa dimasuki & masuk ke akun itu (berisi token akun tsb.).
  impersonationCandidates: (params) =>
    api.get('/auth/impersonate/', { params }).then((res) => res.data),
  impersonate: (userId) => api.post('/auth/impersonate/', { user: userId }).then((res) => res.data),
  changePassword: (oldPassword, newPassword) =>
    api
      .post('/auth/change-password/', { old_password: oldPassword, new_password: newPassword })
      .then((res) => res.data),
}
