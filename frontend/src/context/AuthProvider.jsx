import { useCallback, useEffect, useMemo, useState } from 'react'
import { authApi } from '../api/auth'
import {
  impersonatorStore,
  refreshAccessToken,
  schoolStore,
  setSessionExpiredHandler,
  tokenStore,
} from '../api/client'
import { schoolsApi } from '../api/schools'
import { ROLES } from '../utils/constants'
import { pickSchool } from '../utils/schools'
import { AuthContext } from './auth-context'

// Daftar sekolah yang boleh dibuka + sekolah aktif (yang tersimpan, atau sekolah pertama).
// Admin yayasan tidak otomatis membuka sekolah: tanpa pilihan ia berada di "mode yayasan".
async function loadSchools(user) {
  const schools = await schoolsApi.list()
  const school = pickSchool(schools, schoolStore.get(), {
    firstAsDefault: user.role !== ROLES.FOUNDATION,
  })
  if (school) schoolStore.set(school.id)
  else schoolStore.clear()
  return { schools, school }
}

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // Sekolah yang boleh dibuka user dan sekolah yang sedang dibuka (dikirim lewat header X-School).
  const [schoolState, setSchoolState] = useState({ schools: [], school: null })
  // Hanya perlu memulihkan sesi jika ada refresh token tersimpan dari kunjungan sebelumnya.
  const [initializing, setInitializing] = useState(() => Boolean(tokenStore.getRefresh()))

  useEffect(() => {
    setSessionExpiredHandler(() => {
      tokenStore.clear()
      impersonatorStore.clear()
      setUser(null)
    })

    if (!tokenStore.getRefresh()) return
    refreshAccessToken()
      .then(() => authApi.me())
      .then(async (me) => {
        setSchoolState(await loadSchools(me))
        setUser(me)
      })
      .catch(() => tokenStore.clear())
      .finally(() => setInitializing(false))
  }, [])

  const login = useCallback(async (username, password) => {
    const data = await authApi.login(username, password)
    tokenStore.set(data)
    setSchoolState(await loadSchools(data.user))
    setUser(data.user)
    return data.user
  }, [])

  // Batalkan refresh token yang sedang dipakai di server (sekali jalan, kegagalan diabaikan).
  const endCurrentSession = async () => {
    const refresh = tokenStore.getRefresh()
    try {
      if (refresh) await authApi.logout(refresh)
    } catch {
      // Tetap keluar di sisi frontend walaupun request logout gagal.
    }
    tokenStore.clear()
  }

  const clearSession = () => {
    impersonatorStore.clear()
    schoolStore.clear()
    setSchoolState({ schools: [], school: null })
    setUser(null)
  }

  // Admin yayasan masuk ke akun lain. Sesinya sendiri disimpan dulu agar bisa kembali.
  const impersonate = useCallback(async (userId) => {
    const data = await authApi.impersonate(userId)
    impersonatorStore.set({ refresh: tokenStore.getRefresh(), school: schoolStore.get() })
    tokenStore.set(data)
    schoolStore.clear()
    setSchoolState(await loadSchools(data.user))
    setUser(data.user)
    return data.user
  }, [])

  // Kembali ke akun admin yayasan: token akun yang dimasuki dibatalkan, sesi admin dipulihkan.
  // Jika sesi admin sudah kedaluwarsa, pengguna diarahkan ke halaman login (user = null).
  const stopImpersonating = useCallback(async () => {
    const saved = impersonatorStore.get()
    await endCurrentSession()
    impersonatorStore.clear()
    if (!saved?.refresh) {
      clearSession()
      return null
    }
    try {
      tokenStore.set({ refresh: saved.refresh })
      if (saved.school) schoolStore.set(saved.school)
      else schoolStore.clear()
      await refreshAccessToken()
      const me = await authApi.me()
      setSchoolState(await loadSchools(me))
      setUser(me)
      return me
    } catch {
      tokenStore.clear()
      clearSession()
      return null
    }
  }, [])

  // Keluar saat sedang masuk ke akun lain = keluar dari kedua sesi (akun itu & admin yayasan).
  const logout = useCallback(async () => {
    if (impersonatorStore.get()) await stopImpersonating()
    await endCurrentSession()
    clearSession()
  }, [stopImpersonating])

  // Pindah sekolah: request berikutnya memakai sekolah baru. Halaman dimuat ulang oleh
  // DashboardLayout (key = id sekolah) agar tidak ada data sekolah lama yang tertinggal.
  // `null` = admin yayasan kembali ke mode yayasan (tanpa header X-School).
  const selectSchool = useCallback((school) => {
    if (school) schoolStore.set(school.id)
    else schoolStore.clear()
    setSchoolState((state) => ({ ...state, school }))
  }, [])

  // Muat ulang daftar sekolah (mis. setelah identitas sekolah diubah atau sekolah baru dibuat).
  const reloadSchools = useCallback(async () => setSchoolState(await loadSchools(user)), [user])

  const value = useMemo(
    () => ({
      user,
      initializing,
      login,
      logout,
      impersonate,
      stopImpersonating,
      schools: schoolState.schools.filter((school) => school.is_active !== false),
      school: schoolState.school,
      selectSchool,
      reloadSchools,
    }),
    [
      user,
      initializing,
      login,
      logout,
      impersonate,
      stopImpersonating,
      schoolState,
      selectSchool,
      reloadSchools,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
