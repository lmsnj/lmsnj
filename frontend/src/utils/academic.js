// Tingkat bawaan (SMA/MA/SMK). Tingkat sebenarnya mengikuti jenjang sekolah: hooks/useGrades.js.
export const GRADES = ['X', 'XI', 'XII']

// Pilihan penyaring tingkat untuk OptionPanel. `styles` = [pertama, tengah, akhir] berisi { icon, tile }.
export function gradeFilterOptions(grades, styles, prefix = '') {
  return grades.map((grade, index) => {
    const last = index === grades.length - 1
    const position =
      index === 0 ? 'tingkat pertama' : last ? 'tingkat akhir' : `tingkat ke-${index + 1}`
    const style = styles[index === 0 ? 0 : last ? 2 : 1]
    const description = prefix
      ? `${prefix} ${position}`
      : position[0].toUpperCase() + position.slice(1)
    return { id: grade, title: `Kelas ${grade}`, description, ...style }
  })
}

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
