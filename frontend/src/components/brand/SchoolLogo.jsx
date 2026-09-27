import { apiUrl } from '../../api/client'
import useBranding from '../../hooks/useBranding'

// Logo sekolah. Jika admin sudah mengunggah logo (menu "Identitas Sekolah"), logo itu yang tampil.
// Jika belum, tampil logo PLACEHOLDER buatan sendiri (perisai + buku + inisial "NJ").
// `src` (opsional) = pratinjau logo yang belum disimpan; `null` = pratinjau logo bawaan.
export default function SchoolLogo({ className = 'size-10', src }) {
  const { branding } = useBranding()
  const logo = src !== undefined ? src : branding.logo_url ? apiUrl(branding.logo_url) : null
  const label = `Logo ${branding.school_name}`
  if (logo) {
    return <img src={logo} alt={label} className={`object-contain ${className}`} />
  }
  return <DefaultLogo className={className} label={label} />
}

export function DefaultLogo({ className = 'size-10', label = 'Logo sekolah' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label={label}>
      <path d="M24 3 42 9v13c0 11.5-7.6 19.6-18 23C13.6 41.6 6 33.5 6 22V9l18-6Z" fill="#1f8a4c" />
      <path
        d="M24 6.2 39 11.2V22c0 9.8-6.3 16.8-15 19.9C15.3 38.8 9 31.8 9 22V11.2l15-5Z"
        fill="none"
        stroke="#fbbf24"
        strokeWidth="1.5"
      />
      {/* Buku terbuka */}
      <path
        d="M13 30c3.5-1.6 7-1.6 11 .4 4-2 7.5-2 11-.4v3c-3.5-1.4-7-1.4-11 .6-4-2-7.5-2-11-.6v-3Z"
        fill="#fff"
      />
      <text
        x="24"
        y="25"
        textAnchor="middle"
        fontFamily="inherit"
        fontSize="13"
        fontWeight="800"
        fill="#fff"
      >
        NJ
      </text>
    </svg>
  )
}
