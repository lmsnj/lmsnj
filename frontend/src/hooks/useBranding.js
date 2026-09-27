import { useContext } from 'react'
import { BrandingContext } from '../context/branding-context'
import { SCHOOL } from '../utils/constants'

const FALLBACK = {
  branding: {
    school_name: SCHOOL.name,
    slogan: SCHOOL.slogan,
    app_name: SCHOOL.app,
    logo_url: null,
  },
  setBranding: () => {},
}

/** Identitas sekolah (nama, slogan, nama aplikasi, logo) yang diatur admin. */
export default function useBranding() {
  return useContext(BrandingContext) ?? FALLBACK
}
