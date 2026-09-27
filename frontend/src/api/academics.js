import api from './client'

const get = (url, params) => api.get(url, { params }).then((res) => res.data)
const post = (url, data) => api.post(url, data).then((res) => res.data)
const patch = (url, data) => api.patch(url, data).then((res) => res.data)

export const classroomsApi = {
  list: (params) => get('/classrooms/', params),
  get: (id) => get(`/classrooms/${id}/`),
  create: (data) => post('/classrooms/', data),
  update: (id, data) => patch(`/classrooms/${id}/`, data),
  remove: (id) => api.delete(`/classrooms/${id}/`),
  academicYears: () => get('/classrooms/academic-years/'),
  students: (id) => get(`/classrooms/${id}/students/`),
  addStudents: (id, studentIds) => post(`/classrooms/${id}/students/`, { student_ids: studentIds }),
  removeStudents: (id, studentIds) =>
    post(`/classrooms/${id}/remove-students/`, { student_ids: studentIds }),
}

export const subjectsApi = {
  list: (params) => get('/subjects/', params),
  create: (data) => post('/subjects/', data),
  update: (id, data) => patch(`/subjects/${id}/`, data),
  remove: (id) => api.delete(`/subjects/${id}/`),
}

export const assignmentsApi = {
  list: (params) => get('/teaching-assignments/', params),
  get: (id) => get(`/teaching-assignments/${id}/`),
  create: (data) => post('/teaching-assignments/', data),
  update: (id, data) => patch(`/teaching-assignments/${id}/`, data),
  remove: (id) => api.delete(`/teaching-assignments/${id}/`),
}

// Impor Excel khusus admin: kind = 'subjects' | 'classrooms' | 'teaching-assignments'.
export const adminImportApi = {
  template: (kind) =>
    api.get(`/${kind}/import-template/`, { responseType: 'blob' }).then((res) => res.data),
  run: (kind, file, dryRun) => {
    const form = new FormData()
    form.append('file', file)
    form.append('dry_run', dryRun ? 'true' : 'false')
    return post(`/${kind}/import/`, form)
  },
}
