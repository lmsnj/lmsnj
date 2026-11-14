import { useEffect, useMemo, useState } from 'react'
import { brandingApi } from '../api/branding'
import { apiUrl, TENANT } from '../api/client'
import { schoolsApi } from '../api/schools'
import useAuth from '../hooks/useAuth'
import { SCHOOL } from '../utils/constants'
import { mergeBranding } from '../utils/schools'
import { BrandingContext } from './branding-context'

const DEFAULTS = {
  school_name: SCHOOL.name,
  slogan: SCHOOL.slogan,
  app_name: SCHOOL.app,
  logo_url: null,
}

/**
 * Identitas yang tampil di aplikasi.
 * - `app`: identitas aplikasi dari server (dimuat sekali; halaman login memakai ini).
 * - `branding`: `app` ditimpa nama, slogan, dan logo sekolah yang sedang dibuka (setelah login).
 *   Di subdomain sekolah, identitas sekolah itu sudah dipakai sejak halaman login.
 * - `tenant`: keadaan subdomain sekolah { status: 'none' | 'loading' | 'ok' | 'unknown' |
 *   'inactive', school } — halaman login memakai ini untuk alamat yang salah / sekolah nonaktif.
 * Selama memuat (atau jika gagal) dipakai nilai bawaan dari utils/constants.js.
 */
export default function BrandingProvider({ children }) {
  const { school } = useAuth()
  const [app, setApp] = useState(DEFAULTS)
  const [tenant, setTenant] = useState(() => ({
    status: TENANT.mode === 'school' ? 'loading' : 'none',
    school: null,
  }))
  const branding = useMemo(
    () => mergeBranding(app, school ?? tenant.school),
    [app, school, tenant.school],
  )

  useEffect(() => {
    if (TENANT.mode !== 'school') return
    schoolsApi
      .public(TENANT.code)
      .then((found) => setTenant({ status: found.is_active ? 'ok' : 'inactive', school: found }))
      .catch((error) =>
        // 404 = kode subdomain tidak terdaftar; gangguan lain tidak menghalangi login.
        setTenant({ status: error.response?.status === 404 ? 'unknown' : 'ok', school: null }),
      )
  }, [])

  useEffect(() => {
    brandingApi
      .get()
      .then(setApp)
      .catch(() => {}) // tetap memakai identitas bawaan
  }, [])

  useEffect(() => {
    document.title = branding.app_name
  }, [branding.app_name])

  // Ikon tab browser ikut memakai logo sekolah/yayasan jika sudah diunggah.
  useEffect(() => {
    if (!branding.logo_url) return
    const link = document.querySelector("link[rel='icon']") ?? document.createElement('link')
    link.rel = 'icon'
    link.removeAttribute('type')
    link.href = apiUrl(branding.logo_url)
    document.head.appendChild(link)
  }, [branding.logo_url])

  // setBranding = simpan identitas yayasan/aplikasi baru (dari halaman Identitas Yayasan).
  const value = useMemo(
    () => ({ branding, app, tenant, setBranding: setApp }),
    [branding, app, tenant],
  )
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}
