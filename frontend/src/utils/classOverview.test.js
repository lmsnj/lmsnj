import assert from 'node:assert/strict'
import { test } from 'node:test'
import { latestMaterials, pickTasks } from './classOverview.js'

const now = new Date('2026-10-01T08:00:00Z')
const day = (offset) => new Date(now.getTime() + offset * 86400000).toISOString()

test('tugas: tenggat terdekat dulu, lalu yang sudah lewat (terbaru dulu)', () => {
  const tasks = [
    { id: 1, due_at: day(-5) },
    { id: 2, due_at: day(7) },
    { id: 3, due_at: day(1) },
    { id: 4, due_at: day(-1) },
  ]
  assert.deepEqual(
    pickTasks(tasks, now).map((t) => t.id),
    [3, 2, 4, 1],
  )
  assert.equal(pickTasks(tasks, now, 2).length, 2)
  assert.deepEqual(pickTasks(null, now), [])
})

test('materi terbaru lebih dulu', () => {
  const materials = [
    { id: 1, created_at: day(-3) },
    { id: 2, created_at: day(-1) },
    { id: 3, created_at: day(-2) },
    { id: 4, created_at: day(-9) },
  ]
  assert.deepEqual(
    latestMaterials(materials).map((m) => m.id),
    [2, 3, 1],
  )
})
