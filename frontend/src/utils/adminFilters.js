// Penyaring halaman admin (kelas, mapel, pengampu). Fungsi murni agar mudah diuji.
// Data ini tidak banyak (puluhan–ratusan), jadi dimuat sekali lalu disaring di browser.
import { matchesSearch } from './listFilters.js'

/** Kelas: { search, grade, year }. */
export function filterClassrooms(classrooms, { search = '', grade = '', year = '' }) {
  return (classrooms ?? []).filter(
    (c) =>
      (!grade || c.grade === grade) &&
      (!year || c.academic_year === year) &&
      matchesSearch(`${c.name} ${c.major} ${c.homeroom_teacher_name ?? ''}`, search),
  )
}

/** Pengampu: { search, subject, grade, teacher }. `gradeOf(classroomId)` = tingkat kelas. */
export function filterAssignments(assignments, filters, gradeOf) {
  const { search = '', subject = '', grade = '', teacher = '' } = filters
  return (assignments ?? []).filter(
    (a) =>
      (!subject || String(a.subject) === String(subject)) &&
      (!teacher || String(a.teacher) === String(teacher)) &&
      (!grade || gradeOf(a.classroom) === grade) &&
      matchesSearch(
        `${a.subject_name} ${a.subject_code} ${a.classroom_name} ${a.teacher_name}`,
        search,
      ),
  )
}

/** Mapel: cari kode atau nama. */
export function filterSubjects(subjects, search = '') {
  return (subjects ?? []).filter((s) => matchesSearch(`${s.code} ${s.name}`, search))
}

// Jumlah item per nilai `keyOf(item)`: { nilai: jumlah }.
export function countWith(items, keyOf) {
  const counts = {}
  for (const item of items ?? []) {
    const key = keyOf(item)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

// Jumlah total nilai `field` (mis. jumlah siswa semua kelas).
export const sumOf = (items, field) =>
  (items ?? []).reduce((sum, item) => sum + (item[field] ?? 0), 0)
