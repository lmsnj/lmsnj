const relative = new Intl.RelativeTimeFormat('id', { numeric: 'auto' })

// Teks singkat sisa waktu, contoh: "3 hari lagi", "2 jam yang lalu".
export function dueLabel(dueAt, now = new Date()) {
  const diffMinutes = Math.round((new Date(dueAt) - now) / 60000)
  const abs = Math.abs(diffMinutes)
  if (abs < 60) return relative.format(diffMinutes, 'minute')
  if (abs < 60 * 24) return relative.format(Math.round(diffMinutes / 60), 'hour')
  return relative.format(Math.round(diffMinutes / (60 * 24)), 'day')
}

// <input type="datetime-local"> memakai waktu lokal tanpa zona: "2026-10-01T23:59".
export function toDatetimeLocal(value) {
  const date = new Date(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

// Kirim ke backend dalam ISO (UTC) agar tidak salah zona waktu.
export function fromDatetimeLocal(value) {
  return new Date(value).toISOString()
}

// Tenggat bawaan untuk tugas baru: 7 hari lagi pukul 23:59.
export function defaultDueAt(now = new Date()) {
  const date = new Date(now)
  date.setDate(date.getDate() + 7)
  date.setHours(23, 59, 0, 0)
  return toDatetimeLocal(date)
}

// Status tugas dari sudut pandang siswa.
export function studentTaskStatus(task) {
  const submission = task.my_submission
  if (submission && submission.score !== null) {
    return { label: `Nilai ${formatScore(submission.score)}/${task.max_score}`, color: 'green' }
  }
  if (submission) {
    return submission.is_late
      ? { label: 'Dikumpulkan (terlambat)', color: 'amber' }
      : { label: 'Sudah dikumpulkan', color: 'green' }
  }
  if (!task.is_past_due) return { label: 'Belum dikumpulkan', color: 'blue' }
  if (task.allow_late) return { label: 'Terlambat, masih bisa dikumpulkan', color: 'amber' }
  return { label: 'Tidak dikumpulkan', color: 'red' }
}

// Apakah siswa masih boleh mengumpulkan/mengganti jawaban (sama dengan aturan di backend).
export function canSubmit(task) {
  if (task.my_submission && task.my_submission.score !== null) return false
  if (!task.is_past_due) return true
  return !task.my_submission && task.allow_late
}

// Status satu baris di rekap guru.
export function submissionStatus(submission) {
  if (!submission) return { label: 'Belum', color: 'gray' }
  return submission.is_late
    ? { label: 'Terlambat', color: 'amber' }
    : { label: 'Tepat waktu', color: 'green' }
}

const scoreFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })

// 87.5 -> "87,5"; null -> "-"
export function formatScore(value) {
  return value === null || value === undefined ? '-' : scoreFormat.format(value)
}

// Terima "87,5" maupun "87.5" dari input guru. Mengembalikan angka, null (kosong), atau NaN.
export function parseScore(text) {
  const trimmed = String(text).trim()
  if (trimmed === '') return null
  return /^\d+([.,]\d{1,2})?$/.test(trimmed) ? Number(trimmed.replace(',', '.')) : NaN
}
