// Fungsi murni seputar sekolah aktif (dipakai AuthProvider & BrandingProvider; ada test-nya).

// Sekolah yang dibuka: yang tersimpan sebelumnya jika masih boleh dibuka, selain itu sekolah
// pertama. Sekolah nonaktif (hanya terlihat oleh admin yayasan) tidak bisa dibuka.
export function pickSchool(schools, storedId) {
  const open = schools.filter((school) => school.is_active !== false)
  return open.find((school) => String(school.id) === String(storedId)) ?? open[0] ?? null
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
