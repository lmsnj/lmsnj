// Fungsi murni untuk halaman Statistik Sekolah (grafik). Ada test-nya di statistics.test.js.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** "2026-11-23" -> "23 Nov" (label minggu di sumbu grafik; dibaca sebagai tanggal lokal, bukan UTC). */
export function weekLabel(isoDate) {
  const [, month, day] = isoDate.split('-').map(Number)
  return `${day} ${MONTHS[month - 1]}`
}

/**
 * Batas atas sumbu yang "rapi" (1, 2, 5 x 10^n) agar garis bantu berangka bulat.
 * Semua nilai kosong/0 -> 1 supaya grafik tetap bisa digambar.
 */
export function niceMax(values) {
  const max = Math.max(0, ...values.filter((value) => value != null))
  if (max <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(max))
  const step = [1, 2, 5, 10].find((factor) => factor * power >= max)
  return step * power
}

/** Persen tinggi/lebar batang terhadap batas atas (0-100). */
export function barPercent(value, max) {
  if (!value || !max) return 0
  return Math.min(100, (value / max) * 100)
}

/** Angka berformat Indonesia: 1234.5 -> "1.234,5". */
export function formatNumber(value, digits = 1) {
  if (value == null) return '–'
  return value.toLocaleString('id-ID', { maximumFractionDigits: digits })
}

/** Ringkasan untuk banner: total siswa, pengumpulan 8 minggu, rata-rata nilai semua kelas. */
export function statisticsSummary(data) {
  const students = data.students_by_classroom.reduce((sum, row) => sum + row.count, 0)
  const submissions = data.submissions_by_week.reduce((sum, row) => sum + row.count, 0)
  // Rata-rata tertimbang jumlah nilai, sama dengan merata-ratakan semua nilai sekaligus.
  const graded = data.grades_by_classroom.filter((row) => row.average != null)
  const gradedCount = graded.reduce((sum, row) => sum + row.graded, 0)
  const average = gradedCount
    ? graded.reduce((sum, row) => sum + row.average * row.graded, 0) / gradedCount
    : null
  return { students, submissions, average }
}

/** "2026-11-23" -> "23/11" (label sumbu yang muat di layar HP). */
export function shortWeekLabel(isoDate) {
  const [, month, day] = isoDate.split('-').map(Number)
  return `${day}/${month}`
}
