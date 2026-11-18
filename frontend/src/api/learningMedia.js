import api from './client'
import { uploadConfig } from './upload'

// Media Pembelajaran Interaktif. Studio (guru) dan pemutar (di halaman materi).
export const learningMediaApi = {
  list: (params) => api.get('/learning-media/', { params }).then((res) => res.data),
  get: (id) => api.get(`/learning-media/${id}/`).then((res) => res.data),
  create: (data) => api.post('/learning-media/', data).then((res) => res.data),
  update: (id, data) => api.patch(`/learning-media/${id}/`, data).then((res) => res.data),
  remove: (id) => api.delete(`/learning-media/${id}/`),
  publish: (id, note = '') =>
    api.post(`/learning-media/${id}/publish/`, { note }).then((res) => res.data),
  versions: (id) => api.get(`/learning-media/${id}/versions/`).then((res) => res.data),
  restore: (id, number) =>
    api.post(`/learning-media/${id}/restore/`, { number }).then((res) => res.data),
  copy: (id) => api.post(`/learning-media/${id}/copy/`).then((res) => res.data),
  // Gambar media (dikompres server). Isi media merujuknya sebagai "asset:<id>".
  assets: (id) => api.get(`/learning-media/${id}/assets/`).then((res) => res.data),
  uploadAsset: (id, file, onProgress) => {
    const form = new FormData()
    form.append('file', file)
    return api
      .post(`/learning-media/${id}/assets/`, form, uploadConfig(onProgress))
      .then((res) => res.data)
  },
  removeAsset: (assetId) => api.delete(`/media-assets/${assetId}/`),
  shares: (id) => api.get(`/learning-media/${id}/shares/`).then((res) => res.data),
  setShares: (id, schools) =>
    api.put(`/learning-media/${id}/shares/`, { schools }).then((res) => res.data),
  exportJson: (id) =>
    api.get(`/learning-media/${id}/export/`, { responseType: 'blob' }).then((res) => res.data),
  // Pratinjau sebagai siswa (draft opsional = isi yang belum disimpan). Tidak menyimpan progres.
  preview: (id, draft) =>
    api.post(`/learning-media/${id}/preview/`, draft ? { draft } : {}).then((res) => res.data),
  previewAnswer: (id, data) =>
    api.post(`/learning-media/${id}/preview-answer/`, data).then((res) => res.data),
  previewReveal: (id, data) =>
    api.post(`/learning-media/${id}/preview-reveal/`, data).then((res) => res.data),
}

// Pemutar media di satu materi (= satu kelas). Guru/admin: pratinjau, tidak disimpan.
export const mediaPlayApi = {
  get: (materialId) => api.get(`/materials/${materialId}/media/`).then((res) => res.data),
  answer: (materialId, data) =>
    api.post(`/materials/${materialId}/media/answer/`, data).then((res) => res.data),
  reveal: (materialId, data) =>
    api.post(`/materials/${materialId}/media/reveal/`, data).then((res) => res.data),
  // action: 'visit' (posisi & waktu), 'restart' (ulangi stasiun), 'finish' (selesai + bintang).
  station: (materialId, data) =>
    api.post(`/materials/${materialId}/media/station/`, data).then((res) => res.data),
  reflection: (materialId, data) =>
    api.post(`/materials/${materialId}/media/reflection/`, data).then((res) => res.data),
  leaderboard: (materialId) =>
    api.get(`/materials/${materialId}/media/leaderboard/`).then((res) => res.data),
}

// Pratinjau Studio memakai pemutar yang sama, tetapi jawabannya diperiksa dengan draf media.
export function previewPlayApi(mediaId) {
  return {
    answer: (_, data) => learningMediaApi.previewAnswer(mediaId, data),
    reveal: (_, data) => learningMediaApi.previewReveal(mediaId, data),
    station: async (_, data) =>
      data.action === 'finish' ? { stars: 3, suggestion: null, badges: [], saved: false } : {},
    reflection: async (_, data) => ({ text: data.text, saved: false }),
    leaderboard: async () => ({ rows: [], participants: 0 }),
  }
}
