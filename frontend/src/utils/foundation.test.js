import assert from 'node:assert/strict'
import { test } from 'node:test'
import { attentionItems, byLevelGroup, totals } from './foundation.js'

const base = {
  admins: 1,
  academic_year: '2026/2027',
  students: 0,
  teachers: 0,
  classrooms: 0,
  students_without_classroom: 0,
  classrooms_without_homeroom: 0,
  is_active: true,
}
const schools = [
  { ...base, id: 1, name: 'SMKS', level: 'smk', students: 100, teachers: 10, classrooms: 6 },
  { ...base, id: 2, name: 'MTs', level: 'mts', students: 50, teachers: 5, classrooms: 3 },
  { ...base, id: 3, name: 'MI', level: 'mi', students: 30, teachers: 4, classrooms: 6, admins: 0 },
  { ...base, id: 4, name: 'Lama', level: 'sd', students: 99, is_active: false },
]

test('total hanya dari sekolah aktif', () => {
  const result = totals(schools)
  assert.equal(result.schools, 3)
  assert.equal(result.inactive, 1)
  assert.equal(result.students, 180)
  assert.equal(result.teachers, 19)
  assert.equal(result.classrooms, 15)
  assert.equal(result.materials, 0) // kolom tidak ada = 0
})

test('sebaran per kelompok jenjang', () => {
  const groups = byLevelGroup(schools)
  assert.deepEqual(
    groups.map((g) => [g.label, g.schools, g.students]),
    [
      ['SD / MI', 1, 30],
      ['SMP / MTs', 1, 50],
      ['SMA / MA / SMK', 1, 100],
    ],
  )
})

test('hal yang perlu perhatian', () => {
  const items = attentionItems([
    ...schools,
    {
      ...base,
      id: 5,
      name: 'Baru',
      level: 'sd',
      academic_year: null,
      students_without_classroom: 2,
    },
    { ...base, id: 6, name: 'SMA', level: 'sma', classrooms_without_homeroom: 1 },
  ])
  assert.deepEqual(
    items.map((item) => `${item.school.name}: ${item.text}`),
    [
      'MI: belum punya admin sekolah',
      'Baru: belum punya kelas',
      'Baru: 2 siswa belum masuk kelas',
      'SMA: 1 kelas belum punya wali kelas',
    ],
  )
})
