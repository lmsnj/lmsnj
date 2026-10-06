import { useContext } from 'react'
import { BrandingContext } from '../context/branding-context'
import { SCHOOL } from '../utils/constants'

const DEFAULT_BRANDING = {
  school_name: SCHOOL.name,
  slogan: SCHOOL.slogan,
  app_name: SCHOOL.app,
  logo_url: null,
}
const FALLBACK = { branding: DEFAULT_BRANDING, app: DEFAULT_BRANDING, setBranding: () => {} }

/**
 * Identitas yang tampil: `branding` (sekolah yang sedang dibuka, cadangan = yayasan) dan
 * `app` (identitas yayasan/aplikasi, diatur admin yayasan).
 */
export default function useBranding() {
  return useContext(BrandingContext) ?? FALLBACK
}
