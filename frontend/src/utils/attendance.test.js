import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countSheet, formatRate, initialSheet, rateTone } from './attendance.js'

test('lembar presensi: bawaan Hadir, status tersimpan dipertahankan', () => {
  const sheet = initialSheet([
    { student: 1, status: null },
    { student: 2, status: 'S' },
  ])
  assert.deepEqual(sheet, { 1: 'H', 2: 'S' })
  assert.deepEqual(countSheet({ ...sheet, 3: 'A' }), { H: 1, S: 1, I: 0, A: 1 })
})

test('warna & format persentase', () => {
  assert.equal(rateTone(95), 'text-brand-700')
  assert.equal(rateTone(80), 'text-amber-700')
  assert.equal(rateTone(60), 'text-red-600')
  assert.equal(rateTone(null), 'text-slate-400')
  assert.equal(formatRate(66.7), '66,7%')
  assert.equal(formatRate(null), '-')
})
