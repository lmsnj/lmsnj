import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'
const REFRESH_KEY = 'lms_refresh_token'

// Access token hanya disimpan di memori (hilang saat tab ditutup) agar lebih aman.
// Refresh token disimpan di localStorage supaya pengguna tetap login setelah reload.
let accessToken = null
let refreshPromise = null
let onSessionExpired = () => {}

export const tokenStore = {
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set({ access, refresh }) {
    accessToken = access ?? null
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear() {
    accessToken = null
    localStorage.removeItem(REFRESH_KEY)
  },
}

export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler
}

const api = axios.create({ baseURL: BASE_URL })

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

// Refresh token dirotasi oleh backend (sekali pakai), jadi beberapa request yang
// bersamaan harus berbagi satu proses refresh yang sama.
export function refreshAccessToken() {
  if (!refreshPromise) {
    const refresh = tokenStore.getRefresh()
    if (!refresh) return Promise.reject(new Error('Tidak ada refresh token'))
    refreshPromise = axios
      .post(`${BASE_URL}/auth/refresh/`, { refresh })
      .then(({ data }) => {
        tokenStore.set(data)
        return data.access
      })
      .catch((error) => {
        tokenStore.clear()
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    const isAuthRequest = original?.url?.startsWith('/auth/login')
    if (error.response?.status === 401 && original && !original._retry && !isAuthRequest) {
      original._retry = true
      try {
        await refreshAccessToken()
        return api(original)
      } catch {
        onSessionExpired()
      }
    }
    return Promise.reject(error)
  },
)

export default api
