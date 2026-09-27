// Helper untuk request yang mungkin berisi file.

// Upload file butuh multipart/form-data. Nilai null dikirim sebagai string kosong.
function toFormData(data) {
  const formData = new FormData()
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined) return
    formData.append(key, value === null ? '' : value)
  })
  return formData
}

// Kirim sebagai multipart hanya jika ada file baru; selain itu cukup JSON.
export function requestBody(data) {
  return Object.values(data).some((value) => value instanceof File) ? toFormData(data) : data
}

// Konfigurasi axios untuk melaporkan persentase upload (0–100).
export function uploadConfig(onProgress) {
  if (!onProgress) return {}
  return {
    onUploadProgress: (event) =>
      event.total && onProgress(Math.round((event.loaded * 100) / event.total)),
  }
}
