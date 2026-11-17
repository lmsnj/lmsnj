import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  defaultModuleId,
  defaultGroupIndex,
  groupByChapter,
  groupProgress,
  moduleActivities,
  moveItem,
  parseObjectives,
  pathSummary,
  practiceState,
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
  assert.equal(items[1].label, 'Uji capaian: Menyebut tag')
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

test('Latihan Pemahaman: setelah konten, sebelum capaian; refleksi menunggu lulus', () => {
  const material = {
    title: 'Pengantar',
    material_type: 'video',
    practice_count: 2,
    objectives: ['Menyebut tag'],
    progress: {
      opened: true,
      opened_items: [],
      practice_passed: false,
      checked_objectives: [],
      checks: [{ key: 'opened', done: true }],
    },
  }
  const items = moduleActivities(material)
  assert.deepEqual(
    items.map((item) => item.kind),
    ['content', 'practice', 'objective'],
  )
  assert.equal(items[1].ready, true)
  assert.deepEqual(practiceState(material), { count: 2, passed: false, ready: true, blocked: true })
  material.progress.checks[0].done = false
  assert.equal(practiceState(material).ready, false)
  material.progress.practice_passed = true
  assert.equal(practiceState(material).blocked, false)
  // Tanpa latihan: tidak ada baris latihan dan refleksi tidak tertahan.
  assert.equal(practiceState({ progress: null }).blocked, false)
})

test('materi pertama yang dibuka di tampilan modul', () => {
  const done = { progress: { completed: true, locked: false } }
  const next = { id: 2, progress: { completed: false, locked: false } }
  assert.equal(defaultModuleId([{ id: 1, ...done }, next]), 2)
  assert.equal(defaultModuleId([{ id: 1, ...done }]), 1)
  assert.equal(defaultModuleId([]), null)
})

test('materi dikelompokkan per bab, tanpa bab paling depan', () => {
  const chapters = [
    { id: 1, title: 'Bab 1' },
    { id: 2, title: 'Bab 2' },
    { id: 3, title: 'Bab 3' },
  ]
  const materials = [
    { id: 10, chapter: 2 },
    { id: 11, chapter: null },
    { id: 12, chapter: 1 },
    { id: 13, chapter: 99 }, // bab tidak dikenal = tanpa bab
  ]
  const groups = groupByChapter(materials, chapters)
  assert.deepEqual(
    groups.map((group) => [group.chapter?.id ?? null, group.materials.map((m) => m.id)]),
    [
      [null, [11, 13]],
      [1, [12]],
      [2, [10]],
      [3, []],
    ],
  )
  assert.equal(groupByChapter(materials, chapters, { skipEmpty: true }).length, 3)
})

test('progres kelompok bab dan bab yang dibuka pertama', () => {
  const done = { completed: true, locked: false }
  const open = { completed: false, locked: false }
  const locked = { completed: false, locked: true, locked_by: 'Post Test Bab 1' }
  const loose = { chapter: null, materials: [{ progress: done }, { progress: done }] }
  assert.deepEqual(groupProgress(loose), {
    locked: false,
    lockedBy: null,
    done: 2,
    total: 2,
    completed: true,
  })
  const chapter = (progress) => ({
    chapter: { id: 1, progress },
    materials: [],
  })
  const finished = chapter({
    locked: false,
    completed_materials: 1,
    total_materials: 1,
    completed: true,
  })
  const current = chapter({
    locked: false,
    completed_materials: 0,
    total_materials: 2,
    completed: false,
  })
  const waiting = chapter({
    locked: true,
    locked_by: 'Post Test Bab 1',
    completed_materials: 0,
    total_materials: 1,
    completed: false,
  })
  assert.equal(groupProgress(waiting).lockedBy, 'Post Test Bab 1')
  assert.equal(defaultGroupIndex([loose, finished, current, waiting]), 2)
  assert.equal(defaultGroupIndex([finished]), 0)
  assert.equal(
    groupProgress({ chapter: null, materials: [{ progress: locked }, { progress: open }] }).locked,
    true,
  )
})
