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
  // token: dari kartu peserta ujian, wajib jika asesmen ditautkan ke acara ujian (exam_event).
  // remedial: true = mulai percobaan remedial (hanya jika hasil berstatus remedial).
  start: (id, token, remedial = false) =>
    post(`/assessments/${id}/start/`, {
      ...(token ? { token } : {}),
      ...(remedial ? { remedial } : {}),
    }),
  submit: (id, answers) => post(`/assessments/${id}/submit/`, { answers }),
  myAttempt: (id) => get(`/assessments/${id}/my-attempt/`),
  // Pengawasan: simpan jawaban sementara & catat keluar dari halaman ujian.
  saveDraft: (id, answers) => post(`/assessments/${id}/draft/`, { answers }),
  violation: (id, kind) => post(`/assessments/${id}/violation/`, { kind }),
  // Video interaktif mode latihan: periksa satu checkpoint (benar/salah + pembahasan, lalu terkunci).
  checkpoint: (id, question, checkpoint, response) =>
    post(`/assessments/${id}/checkpoint/`, { question, checkpoint, response }),
}

// Alamat lengkap video soal (alamat bertanda tangan dari API, diputar langsung oleh <video>).
// Alamat yang sudah lengkap (blob: file pilihan guru di pratinjau, atau http) dipakai apa adanya.
export const videoSource = (url) => {
  if (!url) return null
  if (/^(blob:|https?:)/.test(url)) return url
  return `${api.defaults.baseURL.replace(/\/$/, '')}${url}`
}

export const questionsApi = {
  create: (data) => post('/assessment-questions/', data),
  update: (id, data) => patch(`/assessment-questions/${id}/`, data),
  remove: (id) => api.delete(`/assessment-questions/${id}/`),
  // slot: 'stimulus' | 'question' | 'choice' (index = nomor pilihan, 0 = A) | 'video'
  // onProgress (opsional): menerima persen 0-100, untuk file besar seperti video.
  uploadImage: (id, slot, index, file, onProgress) => {
    const form = new FormData()
    form.append('slot', slot)
    form.append('index', index)
    form.append('file', file)
    return api
      .post(`/assessment-questions/${id}/images/`, form, {
        onUploadProgress: (event) =>
          onProgress?.(event.total ? Math.round((event.loaded / event.total) * 100) : 0),
      })
      .then((res) => res.data)
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
