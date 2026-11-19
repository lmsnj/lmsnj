/** Fungsi murni halaman Laporan Media (diuji di report.test.js). */

export const NGAIN_TONES = { Tinggi: 'green', Sedang: 'amber', Rendah: 'red' }

export function formatScore(value) {
  if (value === null || value === undefined) return '-'
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',')
}

export function formatGain(value) {
  return value === null || value === undefined ? '-' : value.toFixed(2).replace('.', ',')
}

/** "3 hari lalu", "hari ini", "belum pernah" dari waktu ISO (relatif terhadap `now`). */
export function lastActiveText(iso, now = new Date()) {
  if (!iso) return 'belum pernah'
  const days = Math.floor((now - new Date(iso)) / 86400000)
  if (days <= 0) return 'hari ini'
  if (days === 1) return 'kemarin'
  return `${days} hari lalu`
}

/** Isi sel stasiun: '' (belum), '★★☆' + tanda selesai. */
export function stationCell(cell) {
  if (!cell) return { text: '·', done: false, started: false }
  return {
    text: '★'.repeat(cell.stars) + '☆'.repeat(3 - cell.stars),
    done: cell.done,
    started: true,
  }
}

export function defaultReminder(mediaTitle) {
  return `Assalamu'alaikum {nama}, ayo lanjutkan media "${mediaTitle}". Sedikit demi sedikit, pasti selesai! 💪`
}

/** Persentase siswa (dibulatkan). */
export function percent(part, total) {
  return total ? Math.round((part / total) * 100) : 0
}
