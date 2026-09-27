// Sapaan sesuai waktu (jam perangkat pengguna) untuk banner Beranda. Fungsi murni agar mudah diuji.

export function timeGreeting(date = new Date()) {
  const hour = date.getHours()
  if (hour >= 4 && hour < 11) return 'Selamat pagi'
  if (hour >= 11 && hour < 15) return 'Selamat siang'
  if (hour >= 15 && hour < 18) return 'Selamat sore'
  return 'Selamat malam'
}

const dateFormat = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

// "Senin, 28 September 2026"
export const longDate = (date = new Date()) => dateFormat.format(date)

// Nama depan untuk sapaan singkat: "Muhammad Rizki" -> "Muhammad".
export const firstName = (fullName) =>
  String(fullName ?? '')
    .trim()
    .split(/\s+/)[0] || ''
