import api from './client'

export const usersApi = {
  list: (params) => api.get('/users/', { params }).then((res) => res.data),
  create: (data) => api.post('/users/', data).then((res) => res.data),
  update: (id, data) => api.patch(`/users/${id}/`, data).then((res) => res.data),
  remove: (id) => api.delete(`/users/${id}/`),
  resetPassword: (id, newPassword) =>
    api.post(`/users/${id}/reset-password/`, { new_password: newPassword }).then((res) => res.data),
}
