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
  // Latihan Pemahaman satu materi: soal (tanpa kunci), periksa jawaban { id_soal: jawaban },
  // simpan rancangan (guru; [] = hapus), dan impor dari Excel (template berisi soal yang ada).
  practice: (id) => api.get(`/materials/${id}/practice/`).then((res) => res.data),
  submitPractice: (id, answers) =>
    api.post(`/materials/${id}/practice/`, { answers }).then((res) => res.data),
  setPractice: (id, items) =>
    api.put(`/materials/${id}/practice/`, { items }).then((res) => res.data),
  practiceTemplate: (id) =>
    api
      .get(`/materials/${id}/practice-template/`, { responseType: 'blob' })
      .then((res) => res.data),
  importPractice: (id, file, dryRun) => {
    const form = new FormData()
    form.append('file', file)
    form.append('dry_run', dryRun ? 'true' : 'false')
    return api.post(`/materials/${id}/practice-import/`, form).then((res) => res.data)
  },
  // Salin materi ke kelas lain (mapel sama) sebagai draf. copyTargets = daftar kelas tujuan
  // [{ teaching_assignment, classroom_name, academic_year, teachers }].
  copyTargets: (teachingAssignment) =>
    api
      .get('/materials/copy-targets/', { params: { teaching_assignment: teachingAssignment } })
      .then((res) => res.data),
  copy: (teachingAssignment, materialIds, target) =>
    api
      .post('/materials/copy/', {
        teaching_assignment: teachingAssignment,
        materials: materialIds,
        target,
      })
      .then((res) => res.data),
  // Gabungkan materi kembar (duplicate) ke materi id; duplicate dihapus, siswa yang sudah tuntas
  // ditandai tercapai. Mengembalikan { completed, detail, material }.
  merge: (id, duplicate) =>
    api.post(`/materials/${id}/merge/`, { duplicate }).then((res) => res.data),
  reorder: (teachingAssignment, materialIds) =>
    api
      .post('/materials/reorder/', {
        teaching_assignment: teachingAssignment,
        materials: materialIds,
      })
      .then((res) => res.data),
}

// Konten tambahan materi (beberapa video/PDF/link dalam satu materi). Siswa: open() mengembalikan
// materinya dengan progres terbaru.
export const materialItemsApi = {
  create: (data, onProgress) =>
    api
      .post('/material-items/', requestBody(data), uploadConfig(onProgress))
      .then((res) => res.data),
  update: (id, data, onProgress) =>
    api
      .patch(`/material-items/${id}/`, requestBody(data), uploadConfig(onProgress))
      .then((res) => res.data),
  remove: (id) => api.delete(`/material-items/${id}/`),
  download: (id) =>
    api.get(`/material-items/${id}/download/`, { responseType: 'blob' }).then((res) => res.data),
  open: (id) => api.post(`/material-items/${id}/open/`).then((res) => res.data),
  reorder: (materialId, itemIds) =>
    api
      .post('/material-items/reorder/', { material: materialId, items: itemIds })
      .then((res) => res.data),
}

// Bab (kelompok materi + Post Test) per kelas-mapel. Siswa: berisi `progress` per bab.
export const chaptersApi = {
  list: (params) => api.get('/chapters/', { params }).then((res) => res.data),
  create: (data) => api.post('/chapters/', data).then((res) => res.data),
  update: (id, data) => api.patch(`/chapters/${id}/`, data).then((res) => res.data),
  remove: (id) => api.delete(`/chapters/${id}/`),
  reorder: (teachingAssignment, chapterIds) =>
    api
      .post('/chapters/reorder/', { teaching_assignment: teachingAssignment, chapters: chapterIds })
      .then((res) => res.data),
}
