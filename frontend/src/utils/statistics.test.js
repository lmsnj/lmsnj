import assert from 'node:assert/strict'
import { test } from 'node:test'
import { barPercent, niceMax, shortWeekLabel, statisticsSummary, weekLabel } from './statistics.js'

test('label minggu', () => {
  assert.equal(weekLabel('2026-11-23'), '23 Nov')
  assert.equal(weekLabel('2026-01-05'), '5 Jan')
  assert.equal(shortWeekLabel('2026-11-23'), '23/11')
})

test('batas atas sumbu yang rapi', () => {
  assert.equal(niceMax([]), 1)
  assert.equal(niceMax([0, null]), 1)
  assert.equal(niceMax([3]), 5)
  assert.equal(niceMax([7, 2]), 10)
  assert.equal(niceMax([23]), 50)
  assert.equal(niceMax([100]), 100)
  assert.equal(niceMax([140]), 200)
})

test('persen batang', () => {
  assert.equal(barPercent(5, 10), 50)
  assert.equal(barPercent(null, 10), 0)
  assert.equal(barPercent(15, 10), 100)
})

test('ringkasan statistik', () => {
  const summary = statisticsSummary({
    students_by_classroom: [{ count: 20 }, { count: 10 }],
    submissions_by_week: [{ count: 3 }, { count: 4 }],
    grades_by_classroom: [
      { average: 80, graded: 3 },
      { average: 60, graded: 1 },
      { average: null, graded: 0 },
    ],
  })
  assert.deepEqual(summary, { students: 30, submissions: 7, average: 75 })
  const empty = statisticsSummary({
    students_by_classroom: [],
    submissions_by_week: [],
    grades_by_classroom: [{ average: null, graded: 0 }],
  })
  assert.equal(empty.average, null)
})
