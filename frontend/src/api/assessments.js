import api from './client'

const get = (url, params) => api.get(url, { params }).then((res) => res.data)
const post = (url, data) => api.post(url, data).then((res) => res.data)
const patch = (url, data) => api.patch(url, data).then((res) => res.data)

export const assessmentsApi = {
  list: (params) => get('/assessments/', params),
  get: (id) => get(`/assessments/${id}/`),
  create: (data) => post('/assessments/', data),
  update: (id, data) => patch(`/assessments/${id}/`, data),
  remove: (id) => api.delete(`/assessments/${id}/`),

  // Guru: soal lengkap dengan kunci jawaban, rekap hasil.
  questions: (id) => get(`/assessments/${id}/questions/`),
  results: (id) => get(`/assessments/${id}/results/`),

  // Siswa: mulai/lanjutkan, kumpulkan, lihat hasil.
  start: (id) => post(`/assessments/${id}/start/`),
  submit: (id, answers) => post(`/assessments/${id}/submit/`, { answers }),
  myAttempt: (id) => get(`/assessments/${id}/my-attempt/`),
  // Pengawasan: simpan jawaban sementara & catat keluar dari halaman ujian.
  saveDraft: (id, answers) => post(`/assessments/${id}/draft/`, { answers }),
  violation: (id, kind) => post(`/assessments/${id}/violation/`, { kind }),
}

export const questionsApi = {
  create: (data) => post('/assessment-questions/', data),
  update: (id, data) => patch(`/assessment-questions/${id}/`, data),
  remove: (id) => api.delete(`/assessment-questions/${id}/`),
  // slot: 'stimulus' | 'question' | 'choice' (index = nomor pilihan, 0 = A)
  uploadImage: (id, slot, index, file) => {
    const form = new FormData()
    form.append('slot', slot)
    form.append('index', index)
    form.append('file', file)
    return post(`/assessment-questions/${id}/images/`, form)
  },
  removeImage: (id, slot, index) =>
    api.delete(`/assessment-questions/${id}/images/`, { params: { slot, index } }),
}

export const questionImportApi = {
  template: () =>
    api.get('/assessments/question-template/', { responseType: 'blob' }).then((res) => res.data),
  // mode 'text' (teks tempel) atau 'excel' (file .xlsx); `images` = ZIP gambar (opsional).
  run: (assessmentId, { mode, text, file, images }, dryRun) => {
    const form = new FormData()
    form.append('mode', mode)
    form.append('dry_run', dryRun ? 'true' : 'false')
    if (mode === 'text') form.append('text', text)
    else if (file) form.append('file', file)
    if (images) form.append('images', images)
    return post(`/assessments/${assessmentId}/import-questions/`, form)
  },
}

export const attemptsApi = {
  get: (id) => get(`/assessment-attempts/${id}/`),
  grade: (id, grades) => patch(`/assessment-attempts/${id}/grade/`, { grades }),
}
