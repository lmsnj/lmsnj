import api from './client'
import { requestBody, uploadConfig } from './upload'

export const materialsApi = {
  list: (params) => api.get('/materials/', { params }).then((res) => res.data),
  create: (data, onProgress) =>
    api.post('/materials/', requestBody(data), uploadConfig(onProgress)).then((res) => res.data),
  update: (id, data, onProgress) =>
    api
      .patch(`/materials/${id}/`, requestBody(data), uploadConfig(onProgress))
      .then((res) => res.data),
  remove: (id) => api.delete(`/materials/${id}/`),
  // File diambil lewat API (dengan token), bukan lewat URL publik.
  download: (id) =>
    api.get(`/materials/${id}/download/`, { responseType: 'blob' }).then((res) => res.data),
}
