// Fungsi murni presensi (dipakai lembar presensi & rekap; ada test-nya).

// Urutan & warna tombol status; kode harus sama dengan AttendanceStatus di backend.
export const ATTENDANCE_STATUSES = [
  { value: 'H', label: 'Hadir', active: 'bg-brand-600 text-white ring-brand-600' },
  { value: 'S', label: 'Sakit', active: 'bg-sky-600 text-white ring-sky-600' },
  { value: 'I', label: 'Izin', active: 'bg-amber-500 text-white ring-amber-500' },
  { value: 'A', label: 'Alpa', active: 'bg-red-600 text-white ring-red-600' },
]

/** Isi awal lembar presensi: status tersimpan, atau Hadir untuk yang belum diisi. */
export function initialSheet(students) {
  return Object.fromEntries(students.map((s) => [s.student, s.status ?? 'H']))
}

/** Jumlah tiap status di lembar yang sedang diisi, mis. { H: 30, S: 1, I: 0, A: 1 }. */
export function countSheet(sheet) {
  const counts = { H: 0, S: 0, I: 0, A: 0 }
  for (const value of Object.values(sheet)) counts[value] += 1
  return counts
}

/** Warna persentase kehadiran: hijau >= batas, kuning di bawahnya, merah < 75%. */
export function rateTone(rate, threshold = 90) {
  if (rate === null || rate === undefined) return 'text-slate-400'
  if (rate >= threshold) return 'text-brand-700'
  return rate >= 75 ? 'text-amber-700' : 'text-red-600'
}

export const formatRate = (rate) =>
  rate === null || rate === undefined ? '-' : `${String(rate).replace('.', ',')}%`
