import { useCallback, useEffect, useMemo, useState } from 'react'
import { authApi } from '../api/auth'
import { refreshAccessToken, setSessionExpiredHandler, tokenStore } from '../api/client'
import { AuthContext } from './auth-context'

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // Hanya perlu memulihkan sesi jika ada refresh token tersimpan dari kunjungan sebelumnya.
  const [initializing, setInitializing] = useState(() => Boolean(tokenStore.getRefresh()))

  useEffect(() => {
    setSessionExpiredHandler(() => {
      tokenStore.clear()
      setUser(null)
    })

    if (!tokenStore.getRefresh()) return
    refreshAccessToken()
      .then(() => authApi.me())
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setInitializing(false))
  }, [])

  const login = useCallback(async (username, password) => {
    const data = await authApi.login(username, password)
    tokenStore.set(data)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    const refresh = tokenStore.getRefresh()
    try {
      if (refresh) await authApi.logout(refresh)
    } catch {
      // Tetap keluar di sisi frontend walaupun request logout gagal.
    }
    tokenStore.clear()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, initializing, login, logout }),
    [user, initializing, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
