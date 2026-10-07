import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  moveItem,
  parseObjectives,
  pathSummary,
  progressStatus,
  toggleObjective,
} from './learningPath.js'

const checks = (...done) => done.map((d, i) => ({ key: `k${i}`, label: 'x', done: d }))

test('status materi bagi siswa', () => {
  assert.equal(progressStatus(null), null)
  assert.deepEqual(progressStatus({ locked: true }), { label: 'Terkunci', color: 'gray' })
  assert.equal(progressStatus({ locked: false, completed: true }).label, 'Tercapai')
  assert.equal(progressStatus({ completed: true, unlocked: true }).label, 'Dibuka guru')
  assert.equal(progressStatus({ opened: false, checks: checks(false) }).label, 'Belum dibuka')
  assert.equal(
    progressStatus({ opened: true, checks: checks(true, false, true) }).label,
    'Sedang dipelajari (2/3)',
  )
})

test('ringkasan jalur belajar', () => {
  const materials = [
    { id: 1, progress: { completed: true, locked: false } },
    { id: 2, progress: { completed: false, locked: false } },
    { id: 3, progress: { completed: false, locked: true } },
  ]
  const summary = pathSummary(materials)
  assert.equal(summary.completed, 1)
  assert.equal(summary.total, 3)
  assert.equal(summary.next.id, 2)
  assert.equal(pathSummary([{ id: 4 }]).total, 0) // guru: tanpa progres
})

test('urutan, capaian, dan centang', () => {
  assert.deepEqual(moveItem([1, 2, 3], 0, 1), [2, 1, 3])
  assert.deepEqual(moveItem([1, 2, 3], 0, -1), [1, 2, 3])
  assert.deepEqual(parseObjectives(' A \n\n B\n'), ['A', 'B'])
  assert.deepEqual(toggleObjective([0, 2], 1), [0, 1, 2])
  assert.deepEqual(toggleObjective([0, 2], 2), [0])
})
