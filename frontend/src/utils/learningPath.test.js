import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  defaultModuleId,
  moduleActivities,
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

test('aktivitas modul materi', () => {
  const material = {
    material_type: 'video',
    objectives: ['Menyebut tag', 'Membuat halaman'],
    objective_quiz: [3, 0],
    progress: {
      opened: true,
      checked_objectives: [1],
      checks: [
        { key: 'opened', label: 'Membuka materi', done: true },
        { key: 'objectives', label: 'Menuntaskan 2 capaian', done: false },
        { key: 'task', label: 'Mengumpulkan tugas “A”', done: true },
        { key: 'reflection', label: 'Menulis cerita reflektif', done: false },
        { key: 'approval', label: 'Disahkan guru', done: false },
      ],
    },
  }
  const items = moduleActivities(material)
  assert.deepEqual(
    items.map((item) => [item.kind, item.done]),
    [
      ['content', true],
      ['quiz', false],
      ['objective', true],
      ['task', true],
      ['approval', false],
    ],
  )
  assert.equal(items[1].label, 'Latihan Pemahaman: Menyebut tag')
  assert.equal(items[1].quizCount, 3)
  // Guru (tanpa progres): hanya isi materi + capaian.
  assert.equal(moduleActivities({ material_type: 'pdf', objectives: [] }).length, 1)
})

test('aktivitas: konten tambahan tampil setelah konten utama', () => {
  const material = {
    title: 'Pengantar',
    material_type: 'video',
    items: [
      { id: 7, title: 'Ringkasan', material_type: 'pdf' },
      { id: 9, title: 'Latihan daring', material_type: 'link' },
    ],
    objectives: [],
    progress: { opened: true, opened_items: [9], checks: [] },
  }
  const items = moduleActivities(material)
  assert.deepEqual(
    items.map((item) => [item.label, item.type, item.done]),
    [
      ['Pengantar', 'video', true],
      ['Ringkasan', 'pdf', false],
      ['Latihan daring', 'link', true],
    ],
  )
  assert.equal(items[0].contentItem, null)
  assert.equal(items[1].contentItem.id, 7)
})

test('materi pertama yang dibuka di tampilan modul', () => {
  const done = { progress: { completed: true, locked: false } }
  const next = { id: 2, progress: { completed: false, locked: false } }
  assert.equal(defaultModuleId([{ id: 1, ...done }, next]), 2)
  assert.equal(defaultModuleId([{ id: 1, ...done }]), 1)
  assert.equal(defaultModuleId([]), null)
})
