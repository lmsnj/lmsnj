import api from './client'

export const authApi = {
  login: (username, password) =>
    api.post('/auth/login/', { username, password }).then((res) => res.data),
  logout: (refresh) => api.post('/auth/logout/', { refresh }),
  me: () => api.get('/auth/me/').then((res) => res.data),
  changePassword: (oldPassword, newPassword) =>
    api
      .post('/auth/change-password/', { old_password: oldPassword, new_password: newPassword })
      .then((res) => res.data),
}
