// Subdomain per sekolah. Fungsi murni (tanpa window) agar bisa diuji.
//
// Dengan VITE_BASE_DOMAIN=sigmateknologi.my.id:
//   smknj.sigmateknologi.my.id  -> { mode: 'school', code: 'smknj' }  (terkunci ke sekolah itu)
//   admin.sigmateknologi.my.id  -> { mode: 'platform' }               (Super Admin)
//   sigmateknologi.my.id / www  -> { mode: 'platform' }
// Tanpa VITE_BASE_DOMAIN, atau alamat lain (mis. IP server): { mode: 'single' } = perilaku lama
// (pilih sekolah lewat "Ganti Sekolah"). Untuk mencoba di laptop: VITE_BASE_DOMAIN=localhost lalu
// buka smknj.localhost:5173 atau admin.localhost:5173.

export const PLATFORM_SUBDOMAIN = 'admin'
const PLATFORM_ALIASES = [PLATFORM_SUBDOMAIN, 'www']

function clean(host) {
  return (host ?? '').trim().toLowerCase().replace(/\.$/, '')
}

export function tenantFromHost(hostname, baseDomain) {
  const host = clean(hostname)
  const base = clean(baseDomain)
  if (!base) return { mode: 'single' }
  if (host === base) return { mode: 'platform' }
  if (!host.endsWith(`.${base}`)) return { mode: 'single' }
  const sub = host.slice(0, -(base.length + 1))
  if (PLATFORM_ALIASES.includes(sub)) return { mode: 'platform' }
  // Subdomain bertingkat (a.b.domain) bukan alamat sekolah.
  if (!sub || sub.includes('.')) return { mode: 'single' }
  return { mode: 'school', code: sub }
}

/** Alamat lengkap sekolah, mis. https://smknj.sigmateknologi.my.id (port ikut jika ada). */
export function schoolAddress(code, baseDomain, { protocol = 'https:', port = '' } = {}) {
  const base = clean(baseDomain)
  if (!base || !code) return null
  return `${protocol}//${code}.${base}${port ? `:${port}` : ''}`
}
