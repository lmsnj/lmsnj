// Fungsi murni untuk Beranda admin yayasan (data dari /api/schools/summary/; ada test-nya).

const SUM_KEYS = [
  'students',
  'teachers',
  'classrooms',
  'subjects',
  'teaching_assignments',
  'materials',
  'tasks',
  'assessments',
  'submissions_this_week',
]

// Jenjang dikelompokkan seperti penyebutan sehari-hari (SD/MI, SMP/MTs, SMA/MA/SMK).
export const LEVEL_GROUPS = [
  { id: 'dasar', label: 'SD / MI', levels: ['sd', 'mi'] },
  { id: 'menengah', label: 'SMP / MTs', levels: ['smp', 'mts'] },
  { id: 'atas', label: 'SMA / MA / SMK', levels: ['sma', 'ma', 'smk'] },
]

/** Jumlah keseluruhan dari sekolah yang AKTIF saja. */
export function totals(schools) {
  const active = schools.filter((school) => school.is_active)
  const result = { schools: active.length, inactive: schools.length - active.length }
  for (const key of SUM_KEYS) {
    result[key] = active.reduce((sum, school) => sum + (school[key] ?? 0), 0)
  }
  return result
}

/** Jumlah sekolah aktif & siswa per kelompok jenjang (kelompok kosong tetap ditampilkan). */
export function byLevelGroup(schools) {
  const active = schools.filter((school) => school.is_active)
  return LEVEL_GROUPS.map((group) => {
    const members = active.filter((school) => group.levels.includes(school.level))
    return {
      ...group,
      schools: members.length,
      students: members.reduce((sum, school) => sum + school.students, 0),
      teachers: members.reduce((sum, school) => sum + school.teachers, 0),
    }
  })
}

/** Hal yang perlu ditindaklanjuti per sekolah aktif: [{ key, school, text }]. */
export function attentionItems(schools) {
  const items = []
  for (const school of schools.filter((s) => s.is_active)) {
    const add = (key, text) => items.push({ key: `${school.id}-${key}`, school, text })
    if (school.admins === 0) add('admin', 'belum punya admin sekolah')
    if (!school.academic_year) add('classes', 'belum punya kelas')
    if (school.students_without_classroom > 0) {
      add('students', `${school.students_without_classroom} siswa belum masuk kelas`)
    }
    if (school.classrooms_without_homeroom > 0) {
      add('homeroom', `${school.classrooms_without_homeroom} kelas belum punya wali kelas`)
    }
  }
  return items
}
