import api from './client'

// Gambar yang sudah diunduh disimpan selama halaman terbuka agar tidak diunduh ulang.
const cache = new Map()

export function loadAuthImage(url) {
  if (!cache.has(url)) {
    const promise = api
      .get(url, { responseType: 'blob' })
      .then((res) => URL.createObjectURL(res.data))
      .catch((error) => {
        cache.delete(url) // gagal: boleh dicoba lagi nanti
        throw error
      })
    cache.set(url, promise)
  }
  return cache.get(url)
}
