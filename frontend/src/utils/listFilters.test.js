import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  countByAssignment,
  countStatuses,
  filterChips,
  filterList,
  matchesSearch,
} from './listFilters.js'

const tasks = [
  { id: 1, teaching_assignment: 5, title: 'Tugas Profil HTML', ungraded_count: 2 },
  { id: 2, teaching_assignment: 5, title: 'Latihan Heading', ungraded_count: 0 },
  { id: 3, teaching_assignment: 7, title: 'Teks Prosedur', ungraded_count: 1 },
]
const STATUSES = [
  { id: 'perlu-dinilai', title: 'Perlu dinilai', match: (t) => t.ungraded_count > 0 },
]
const options = { textOf: (t) => t.title, statuses: STATUSES }

test('pencarian: semua kata harus ada, tanpa beda huruf besar', () => {
  assert.equal(matchesSearch('Tugas Profil HTML', 'html tugas'), true)
  assert.equal(matchesSearch('Tugas Profil HTML', 'css'), false)
  assert.equal(matchesSearch('apa saja', ''), true)
})

test('saring berdasarkan pengampu, status, dan kata kunci', () => {
  const ids = (filters) => filterList(tasks, filters, options).map((t) => t.id)
  assert.deepEqual(ids({}), [1, 2, 3])
  assert.deepEqual(ids({ assignment: '5' }), [1, 2])
  assert.deepEqual(ids({ status: 'perlu-dinilai' }), [1, 3])
  assert.deepEqual(ids({ status: 'perlu-dinilai', assignment: 5, search: 'profil' }), [1])
  assert.deepEqual(ids({ status: 'tidak-dikenal' }), [1, 2, 3]) // status asing diabaikan
})

test('hitung per status dan per pengampu', () => {
  assert.deepEqual(countStatuses(tasks, STATUSES), { 'perlu-dinilai': 2 })
  assert.deepEqual(countByAssignment(tasks), { 5: 2, 7: 1 })
})

test('label penyaring aktif', () => {
  const chips = filterChips(
    { assignment: '7', status: 'perlu-dinilai', search: ' html ' },
    {
      assignments: [{ id: 7, subject_name: 'B. Indonesia' }],
      assignmentLabel: (a) => a.subject_name,
      options: STATUSES,
    },
  )
  assert.deepEqual(
    chips.map((c) => [c.key, c.label]),
    [
      ['assignment', 'B. Indonesia'],
      ['status', 'Perlu dinilai'],
      ['search', '“html”'],
    ],
  )
})
