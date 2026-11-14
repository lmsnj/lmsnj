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
        assignments: [],
      })
    }
    lessons.get(key).classrooms.push(entry.classroom_name)
    lessons.get(key).assignments.push(entry.teaching_assignment)
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

// "HH:MM:SS" dari jam perangkat, agar bisa dibandingkan langsung dengan jam slot.
function clockOf(date) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

function sameLessons(a, b) {
  return a.map((lesson) => lesson.key).join('|') === b.map((lesson) => lesson.key).join('|')
}

/**
 * Pelajaran hari ini untuk Beranda. Jam berurutan dengan pelajaran yang sama digabung menjadi satu
 * blok (mis. Jam 1-2), tetapi tidak melewati istirahat/kegiatan atau jam kosong.
 * `status`: 'done' (sudah lewat), 'now' (sedang berlangsung), 'upcoming'.
 */
export function todayLessons(slots, entries, date = new Date()) {
  const now = clockOf(date)
  const blocks = []
  let previous = null
  for (const { slot, lessons } of dayRows(slots, entries, weekdayOf(date))) {
    if (slot.kind === 'activity' || lessons.length === 0) {
      previous = null
      continue
    }
    if (previous && sameLessons(previous.lessons, lessons)) {
      previous.endsAt = slot.ends_at
      if (slot.period != null) previous.periods.push(slot.period)
    } else {
      previous = {
        key: slot.id,
        startsAt: slot.starts_at,
        endsAt: slot.ends_at,
        periods: slot.period != null ? [slot.period] : [],
        lessons,
      }
      blocks.push(previous)
    }
  }
  return blocks.map((block) => ({
    ...block,
    status: now >= block.endsAt ? 'done' : now >= block.startsAt ? 'now' : 'upcoming',
  }))
}

// "Jam 3" atau "Jam 3-4"; kosong jika slot tidak bernomor.
export function periodLabel(periods) {
  if (periods.length === 0) return ''
  const first = periods[0]
  const last = periods[periods.length - 1]
  return first === last ? `Jam ${first}` : `Jam ${first}-${last}`
}

// Tanggal lokal "YYYY-MM-DD" (untuk input type="date"; toISOString bisa mundur sehari di WIB).
export function isoDate(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Rentang bawaan "Buat dari Jadwal": hari ini sampai 6 hari ke depan (satu pekan).
export function weekAhead(date = new Date()) {
  const end = new Date(date)
  end.setDate(end.getDate() + 6)
  return { date_from: isoDate(date), date_to: isoDate(end) }
}

// Ringkasan laporan impor jadwal dari server, untuk ditampilkan sebagai daftar.
export function importSummary(report) {
  const { subjects, classrooms, teachers, assignments, timetable } = report
  const matched = (count) => (count ? `, ${count} dicocokkan` : '')
  return [
    {
      label: 'Mapel',
      value: `${subjects.created.length} baru, ${subjects.existing} sudah ada${matched(subjects.matched.length)}`,
    },
    {
      label: 'Kelas',
      value: `${classrooms.created.length} baru, ${classrooms.existing} sudah ada${matched(classrooms.matched.length)}`,
    },
    {
      label: 'Guru',
      value: `${teachers.created.length} akun baru, ${teachers.existing} sudah ada${matched(teachers.linked.length)}`,
    },
    {
      label: 'Pengampu',
      value: `${assignments.created} baru, ${assignments.existing} sudah ada`,
    },
    {
      label: `Jadwal ${timetable.code}`,
      value: `${timetable.created ? 'versi baru' : 'mengganti isi versi ini'} · ${timetable.slots} slot waktu, ${timetable.entries} jam pelajaran${timetable.active ? ' · jadi jadwal aktif' : ''}`,
    },
  ]
}
