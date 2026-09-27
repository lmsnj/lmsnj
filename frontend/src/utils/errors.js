// Mengubah respons error DRF menjadi pesan yang siap ditampilkan.

export function getErrorMessage(error, fallback = 'Terjadi kesalahan. Silakan coba lagi.') {
  if (!error?.response) return 'Tidak dapat terhubung ke server. Periksa koneksi Anda.'
  const data = error.response.data
  if (data?.detail) return data.detail
  if (data && typeof data === 'object') {
    const first = Object.values(data)[0]
    if (Array.isArray(first)) return first[0]
    if (typeof first === 'string') return first
  }
  return fallback
}

// Error per field, contoh: { username: 'Pengguna dengan username ini sudah ada.' }
export function getFieldErrors(error) {
  const data = error?.response?.data
  if (!data || typeof data !== 'object' || data.detail) return {}
  return Object.fromEntries(
    Object.entries(data).map(([field, messages]) => [
      field,
      Array.isArray(messages) ? messages.join(' ') : String(messages),
    ]),
  )
}
