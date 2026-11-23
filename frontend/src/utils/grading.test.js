import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkValue, fillEmpty, gridSummary, isBelowKkm, predicateScores } from './grading.js'

const BANDS = [
  { label: 'A', min: 90 },
  { label: 'B', min: 80 },
  { label: 'C', min: 75 },
  { label: 'D', min: 0 },
]

test('skala 0-100 dan 0-4 (sama dengan backend)', () => {
  assert.deepEqual(checkValue('0-100', '85'), { score: 85 })
  assert.deepEqual(checkValue('0-100', ' 87,5 '), { score: 87.5 })
  assert.deepEqual(checkValue('0-100', ''), { score: null })
  assert.ok(checkValue('0-100', '101').error)
  assert.ok(checkValue('0-100', '-1').error)
  assert.equal(checkValue('0-100', '80.123').error, 'Maksimal 2 angka di belakang koma.')
  assert.equal(checkValue('0-100', 'abc').error, 'Isi dengan angka.')
  assert.deepEqual(checkValue('0-4', '3'), { score: 75 })
  assert.deepEqual(checkValue('0-4', '3.33'), { score: 83.25 })
  assert.ok(checkValue('0-4', '5').error)
})

test('predikat = nilai tengah rentang', () => {
  assert.deepEqual(predicateScores(BANDS), { A: 95, B: 85, C: 77, D: 37 })
  assert.deepEqual(checkValue('predikat', 'b', BANDS), { score: 85 })
  assert.equal(checkValue('predikat', 'E', BANDS).error, 'Pilih salah satu: A, B, C, D.')
})

test('KKM, isi yang kosong, dan ringkasan', () => {
  assert.ok(isBelowKkm(70, 75))
  assert.ok(!isBelowKkm(75, 75))
  assert.ok(!isBelowKkm(null, 75))
  const rows = [
    { student: 1, value: '80', score: 80, status: 'hadir' },
    { student: 2, value: '', score: null, status: 'hadir' },
    { student: 3, value: '', score: null, status: 'tidak_hadir' },
    { student: 4, value: '60', score: 60, status: 'hadir' },
    { student: 5, value: '120', score: null, status: 'hadir' }, // isian salah
  ]
  assert.deepEqual(fillEmpty(rows), [2])
  assert.deepEqual(gridSummary(rows, 75), { graded: 2, absent: 1, empty: 2, below: 1 })
})
