import { useEffect, useMemo, useState } from 'react'
import { brandingApi } from '../api/branding'
import { apiUrl } from '../api/client'
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
 * - `app`: identitas yayasan/aplikasi dari server (dimuat sekali; halaman login memakai ini).
 * - `branding`: `app` ditimpa nama, slogan, dan logo sekolah yang sedang dibuka (setelah login).
 * Selama memuat (atau jika gagal) dipakai nilai bawaan dari utils/constants.js.
 */
export default function BrandingProvider({ children }) {
  const { school } = useAuth()
  const [app, setApp] = useState(DEFAULTS)
  const branding = useMemo(() => mergeBranding(app, school), [app, school])

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
  const value = useMemo(() => ({ branding, app, setBranding: setApp }), [branding, app])
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}
