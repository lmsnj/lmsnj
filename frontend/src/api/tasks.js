import api from './client'
import { requestBody, uploadConfig } from './upload'

const blob = (url) => api.get(url, { responseType: 'blob' }).then((res) => res.data)

// Catatan: "tasks" = tugas untuk siswa; berbeda dengan "teaching-assignments" (pengampu).
export const tasksApi = {
  list: (params) => api.get('/tasks/', { params }).then((res) => res.data),
  get: (id) => api.get(`/tasks/${id}/`).then((res) => res.data),
  create: (data, onProgress) =>
    api.post('/tasks/', requestBody(data), uploadConfig(onProgress)).then((res) => res.data),
  update: (id, data, onProgress) =>
    api.patch(`/tasks/${id}/`, requestBody(data), uploadConfig(onProgress)).then((res) => res.data),
  remove: (id) => api.delete(`/tasks/${id}/`),
  attachment: (id) => blob(`/tasks/${id}/attachment/`),

  // Guru: rekap seluruh siswa beserta pengumpulannya.
  roster: (id) => api.get(`/tasks/${id}/submissions/`).then((res) => res.data),

  // Siswa: pengumpulan miliknya sendiri.
  submit: (id, data, onProgress) =>
    api
      .put(`/tasks/${id}/my-submission/`, requestBody(data), uploadConfig(onProgress))
      .then((res) => res.data),
  cancelSubmission: (id) => api.delete(`/tasks/${id}/my-submission/`),
}

export const submissionsApi = {
  download: (id) => blob(`/submissions/${id}/download/`),
}

export const gradesApi = {
  // score = null untuk menghapus nilai.
  grade: (submissionId, data) =>
    api.patch(`/submissions/${submissionId}/grade/`, data).then((res) => res.data),
  gradebook: (assignmentId) => api.get(`/gradebook/${assignmentId}/`).then((res) => res.data),
  exportCsv: (assignmentId) => blob(`/gradebook/${assignmentId}/export/`),
}
