// Fungsi murni seputar sekolah aktif (dipakai AuthProvider & BrandingProvider; ada test-nya).

// Sekolah yang dibuka: yang tersimpan sebelumnya jika masih boleh dibuka, selain itu sekolah
// pertama. Sekolah nonaktif (hanya terlihat oleh admin yayasan) tidak bisa dibuka.
// `firstAsDefault: false` (admin yayasan): tanpa pilihan tersimpan = mode yayasan (null).
export function pickSchool(schools, storedId, { firstAsDefault = true } = {}) {
  const open = schools.filter((school) => school.is_active !== false)
  const stored = open.find((school) => String(school.id) === String(storedId))
  return stored ?? (firstAsDefault ? open[0] : null) ?? null
}

// Identitas yang tampil: identitas yayasan/aplikasi, ditimpa nama, slogan, dan logo sekolah yang
// sedang dibuka. Sekolah tanpa logo memakai logo yayasan. Nama aplikasi (judul tab) tetap.
export function mergeBranding(app, school) {
  if (!school) return app
  return {
    ...app,
    school_name: school.name,
    slogan: school.slogan,
    logo_url: school.logo_url ?? app.logo_url,
  }
}
