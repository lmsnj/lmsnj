// Fungsi murni untuk halaman Jadwal Pelajaran. Nomor hari mengikuti backend: Senin = 0 ... Ahad = 6.

// Pekan sekolah dimulai hari Sabtu dan libur hari Jumat.
export const SCHOOL_WEEK = [5, 6, 0, 1, 2, 3, 4]

// Nomor hari versi backend untuk sebuah tanggal (JavaScript: Minggu = 0).
export function weekdayOf(date = new Date()) {
  return (date.getDay() + 6) % 7
}

// Hari yang punya jadwal, diurutkan sesuai pekan sekolah.
export function daysOf(slots) {
  const labels = new Map(slots.map((slot) => [slot.day, slot.day_display]))
  return SCHOOL_WEEK.filter((day) => labels.has(day)).map((day) => ({
    day,
    label: labels.get(day),
  }))
}

// Hari yang dibuka pertama kali: hari ini jika ada jadwalnya, selain itu hari pertama.
export function defaultDay(days, date = new Date()) {
  const today = weekdayOf(date)
  return days.some((item) => item.day === today) ? today : (days[0]?.day ?? null)
}

// "07:30:00" -> "07.30"
export function clock(value) {
  return value.slice(0, 5).replace(':', '.')
}

export function timeRange(slot) {
  return `${clock(slot.starts_at)} - ${clock(slot.ends_at)}`
}

/**
 * Baris jadwal satu hari: setiap slot waktu beserta pelajarannya.
 * Kelas gabungan (guru & mapel sama pada jam yang sama) dijadikan satu pelajaran dengan
 * beberapa nama kelas.
 */
export function dayRows(slots, entries, day) {
  const bySlot = new Map()
  for (const entry of entries) {
    if (!bySlot.has(entry.time_slot)) bySlot.set(entry.time_slot, new Map())
    const lessons = bySlot.get(entry.time_slot)
    const key = `${entry.subject_code}#${entry.teacher}`
    if (!lessons.has(key)) {
      lessons.set(key, {
        key,
        subjectCode: entry.subject_code,
        subjectName: entry.subject_name,
        teacherName: entry.teacher_name,
        classrooms: [],
      })
    }
    lessons.get(key).classrooms.push(entry.classroom_name)
  }
  return slots
    .filter((slot) => slot.day === day)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((slot) => ({ slot, lessons: [...(bySlot.get(slot.id)?.values() ?? [])] }))
}

// Jumlah jam pelajaran per minggu; kelas gabungan pada jam yang sama dihitung sekali.
export function countPeriods(entries) {
  return new Set(entries.map((entry) => entry.time_slot)).size
}

// Pilihan dropdown (kelas atau guru) dari isi jadwal, tanpa duplikat, urut nama.
export function optionsFrom(entries, idKey, nameKey) {
  const names = new Map(entries.map((entry) => [entry[idKey], entry[nameKey]]))
  return [...names]
    .map(([id, name]) => ({ value: String(id), label: name }))
    .sort((a, b) => a.label.localeCompare(b.label, 'id', { numeric: true }))
}

// Selisih jam terjadwal dengan JP resmi yang memang dijadwalkan (JP di luar jadwal, mis. PKL,
// tidak ikut dibandingkan); null jika JP resmi belum diisi.
export function loadGap(load) {
  if (load.official_hours == null) return null
  return load.scheduled_periods - (load.official_hours - load.unscheduled_hours)
}
