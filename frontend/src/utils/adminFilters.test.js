import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  countWith,
  filterAssignments,
  filterClassrooms,
  filterSubjects,
  sumOf,
} from './adminFilters.js'

const classrooms = [
  { id: 1, name: 'X RPL 1', grade: 'X', major: 'RPL', academic_year: '2026/2027', student_count: 4, homeroom_teacher_name: 'Siti Aminah' },
  { id: 2, name: 'XI RPL 1', grade: 'XI', major: 'RPL', academic_year: '2026/2027', student_count: 6, homeroom_teacher_name: 'Ahmad' },
  { id: 3, name: 'XI TKJ 1', grade: 'XI', major: 'TKJ', academic_year: '2025/2026', student_count: 5 },
] // prettier-ignore

test('kelas: saring tingkat, tahun ajaran, dan kata kunci (termasuk wali kelas)', () => {
  const ids = (filters) => filterClassrooms(classrooms, filters).map((c) => c.id)
  assert.deepEqual(ids({}), [1, 2, 3])
  assert.deepEqual(ids({ grade: 'XI' }), [2, 3])
  assert.deepEqual(ids({ year: '2025/2026' }), [3])
  assert.deepEqual(ids({ search: 'rpl' }), [1, 2])
  assert.deepEqual(ids({ search: 'siti' }), [1])
})

test('pengampu: saring mapel, guru, dan tingkat kelas', () => {
  const assignments = [
    { id: 1, subject: 9, teacher: 20, classroom: 1, subject_name: 'Basis Data', subject_code: 'BD', classroom_name: 'X RPL 1', teacher_name: 'Ahmad' },
    { id: 2, subject: 8, teacher: 21, classroom: 2, subject_name: 'Bahasa Indonesia', subject_code: 'BINDO', classroom_name: 'XI RPL 1', teacher_name: 'Siti' },
    { id: 3, subject: 8, teacher: 21, classroom: 3, subject_name: 'Bahasa Indonesia', subject_code: 'BINDO', classroom_name: 'XI TKJ 1', teacher_name: 'Siti' },
  ] // prettier-ignore
  const gradeOf = (id) => classrooms.find((c) => c.id === id)?.grade
  const ids = (filters) => filterAssignments(assignments, filters, gradeOf).map((a) => a.id)
  assert.deepEqual(ids({ subject: '8' }), [2, 3])
  assert.deepEqual(ids({ teacher: 20 }), [1])
  assert.deepEqual(ids({ grade: 'XI', search: 'tkj' }), [3])
  assert.deepEqual(ids({ search: 'bindo siti' }), [2, 3])
})

test('mapel: cari kode atau nama', () => {
  const subjects = [
    { id: 1, code: 'PWEB', name: 'Pemrograman Web' },
    { id: 2, code: 'BD', name: 'Basis Data' },
  ]
  assert.deepEqual(
    filterSubjects(subjects, 'pweb').map((s) => s.id),
    [1],
  )
  assert.deepEqual(
    filterSubjects(subjects, 'data').map((s) => s.id),
    [2],
  )
})

test('hitung per kelompok dan jumlah total', () => {
  assert.deepEqual(
    countWith(classrooms, (c) => c.grade),
    { X: 1, XI: 2 },
  )
  assert.equal(sumOf(classrooms, 'student_count'), 15)
})
