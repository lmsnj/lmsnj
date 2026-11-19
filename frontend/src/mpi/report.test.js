import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  defaultReminder,
  formatGain,
  formatScore,
  lastActiveText,
  percent,
  stationCell,
} from './report.js'

test('format nilai & N-Gain', () => {
  assert.equal(formatScore(70), '70')
  assert.equal(formatScore(66.67), '66,7')
  assert.equal(formatScore(null), '-')
  assert.equal(formatGain(0.5), '0,50')
  assert.equal(formatGain(undefined), '-')
})

test('terakhir aktif relatif', () => {
  const now = new Date('2026-11-20T10:00:00Z')
  assert.equal(lastActiveText(null, now), 'belum pernah')
  assert.equal(lastActiveText('2026-11-20T08:00:00Z', now), 'hari ini')
  assert.equal(lastActiveText('2026-11-19T08:00:00Z', now), 'kemarin')
  assert.equal(lastActiveText('2026-11-15T08:00:00Z', now), '5 hari lalu')
})

test('sel stasiun, pesan pengingat, persen', () => {
  assert.deepEqual(stationCell({ stars: 2, done: true }), {
    text: '★★☆',
    done: true,
    started: true,
  })
  assert.equal(stationCell(undefined).started, false)
  assert.ok(defaultReminder('Flowgorithm').includes('{nama}'))
  assert.equal(percent(1, 3), 33)
  assert.equal(percent(0, 0), 0)
})
