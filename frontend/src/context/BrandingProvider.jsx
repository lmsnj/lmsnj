import { useEffect, useMemo, useState } from 'react'
import { brandingApi } from '../api/branding'
import { apiUrl } from '../api/client'
import { SCHOOL } from '../utils/constants'
import { BrandingContext } from './branding-context'

const DEFAULTS = {
  school_name: SCHOOL.name,
  slogan: SCHOOL.slogan,
  app_name: SCHOOL.app,
  logo_url: null,
}

/**
 * Memuat identitas sekolah dari server sekali saat aplikasi dibuka. Selama memuat (atau jika
 * gagal) dipakai nilai bawaan dari utils/constants.js. Nama aplikasi juga menjadi judul tab.
 */
export default function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(DEFAULTS)

  useEffect(() => {
    brandingApi
      .get()
      .then(setBranding)
      .catch(() => {}) // tetap memakai identitas bawaan
  }, [])

  useEffect(() => {
    document.title = branding.app_name
  }, [branding.app_name])

  // Ikon tab browser ikut memakai logo sekolah jika sudah diunggah.
  useEffect(() => {
    if (!branding.logo_url) return
    const link = document.querySelector("link[rel='icon']") ?? document.createElement('link')
    link.rel = 'icon'
    link.removeAttribute('type')
    link.href = apiUrl(branding.logo_url)
    document.head.appendChild(link)
  }, [branding.logo_url])

  const value = useMemo(() => ({ branding, setBranding }), [branding])
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}
