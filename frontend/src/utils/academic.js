export const GRADES = ['X', 'XI', 'XII']

// Tahun ajaran baru dimulai bulan Juli.
export function currentAcademicYear(date = new Date()) {
  const year = date.getFullYear()
  const start = date.getMonth() >= 6 ? year : year - 1
  return `${start}/${start + 1}`
}

// Ukuran halaman besar untuk mengisi dropdown pilihan (guru, mapel, kelas).
export const ALL = { page_size: 500 }

export function toOptions(items, label, placeholder) {
  const options = (items ?? []).map((item) => ({ value: String(item.id), label: label(item) }))
  return placeholder ? [{ value: '', label: placeholder }, ...options] : options
}
