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

  // Capaian materi. Siswa: tandai dibuka & centang capaian (mengembalikan materi terbaru).
  open: (id) => api.post(`/materials/${id}/open/`).then((res) => res.data),
  checkObjectives: (id, checked) =>
    api.post(`/materials/${id}/objectives/`, { checked }).then((res) => res.data),
  // Cerita reflektif siswa (syarat capaian jika materi mewajibkannya).
  saveReflection: (id, reflection) =>
    api.post(`/materials/${id}/reflection/`, { reflection }).then((res) => res.data),
  // Guru: progres semua siswa; records: [{ student, teacher_approved?, unlocked?, note? }].
  progress: (id) => api.get(`/materials/${id}/progress/`).then((res) => res.data),
  saveProgress: (id, records) =>
    api.put(`/materials/${id}/progress/`, { records }).then((res) => res.data),
  // Asesmen "Cek Pemahaman" otomatis. Status: { concepts, min_concepts, objectives, ai_enabled }.
  // data: { source: 'concepts' (gratis) | 'ai', question_count }.
  autoAssessmentStatus: (id) =>
    api.get(`/materials/${id}/generate-assessment/`).then((res) => res.data),
  generateAssessment: (id, data) =>
    api.post(`/materials/${id}/generate-assessment/`, data).then((res) => res.data),
  // Kuis kecil per capaian: soal (tanpa kunci) dan pemeriksaan jawaban { id_soal: jawaban }.
  objectiveQuiz: ({ id, index }) =>
    api.get(`/materials/${id}/objective-quiz/`, { params: { index } }).then((res) => res.data),
  submitObjectiveQuiz: (id, index, answers) =>
    api.post(`/materials/${id}/objective-quiz/`, { index, answers }).then((res) => res.data),
  // Impor kuis capaian dari Excel (template berisi kuis yang ada).
  objectiveQuizTemplate: (id) =>
    api
      .get(`/materials/${id}/objective-quiz-template/`, { responseType: 'blob' })
      .then((res) => res.data),
  importObjectiveQuiz: (id, file, dryRun) => {
    const form = new FormData()
    form.append('file', file)
    form.append('dry_run', dryRun ? 'true' : 'false')
    return api.post(`/materials/${id}/objective-quiz-import/`, form).then((res) => res.data)
  },
  reorder: (teachingAssignment, materialIds) =>
    api
      .post('/materials/reorder/', {
        teaching_assignment: teachingAssignment,
        materials: materialIds,
      })
      .then((res) => res.data),
}
