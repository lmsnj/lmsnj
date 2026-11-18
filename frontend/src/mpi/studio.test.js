import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cloneWithNewIds,
  containerOf,
  defaultImportMode,
  draftStats,
  duplicateInList,
  emptyDraft,
  getAt,
  importPayload,
  linesToList,
  moveInList,
  newStation,
  newStep,
  STATION_TEMPLATES,
  STEP_KINDS,
  updateAt,
} from './studio.js'

test('newStep untuk semua jenis punya id & isi awal', () => {
  for (const kind of STEP_KINDS) {
    const step = newStep(kind)
    assert.equal(step.kind, kind)
    assert.match(step.id, /^l[a-z0-9]+$/)
    assert.ok(step.id.length <= 40)
  }
  assert.throws(() => newStep('aneh'))
})

test('template stasiun menghasilkan langkah dengan id unik', () => {
  for (const name of Object.keys(STATION_TEMPLATES)) {
    const station = newStation(name)
    const ids = station.steps.map((step) => step.id)
    assert.equal(new Set(ids).size, ids.length)
  }
})

test('moveInList tidak keluar batas', () => {
  assert.deepEqual(moveInList([1, 2, 3], 0, -1), [1, 2, 3])
  assert.deepEqual(moveInList([1, 2, 3], 0, 1), [2, 1, 3])
})

test('duplikat memberi id baru di semua tingkat', () => {
  const part = emptyDraft().parts[0]
  const copy = cloneWithNewIds(part)
  assert.notEqual(copy.id, part.id)
  assert.notEqual(copy.stations[0].id, part.stations[0].id)
  assert.notEqual(copy.stations[0].steps[0].id, part.stations[0].steps[0].id)
  const list = duplicateInList([newStep('text')], 0)
  assert.equal(list.length, 2)
  assert.notEqual(list[0].id, list[1].id)
})

test('updateAt & containerOf tidak mengubah draf lama', () => {
  const draft = emptyDraft()
  const path = { part: 0, station: 0, list: 'steps', step: 1 }
  const updated = updateAt(draft, path, (step) => ({ ...step, title: 'Baru' }))
  assert.equal(getAt(updated, path).title, 'Baru')
  assert.equal(getAt(draft, path).title, '')
  const { list, index, apply } = containerOf(updated, path)
  const removed = apply(list.filter((_, i) => i !== index))
  assert.equal(getAt(removed, { part: 0, station: 0 }).steps.length, 3)
  assert.equal(draftStats(updated).practice, 1)
  assert.deepEqual(draftStats(updated), { parts: 1, stations: 1, steps: 4, practice: 1 })
})

test('linesToList', () => {
  assert.deepEqual(linesToList(' a \n\n b '), ['a', 'b'])
})

test('mode impor bawaan dan isian impor', () => {
  assert.equal(defaultImportMode('excel', true), 'replace')
  assert.equal(defaultImportMode('word', true), 'append')
  assert.equal(defaultImportMode('excel', false), 'append')
  assert.equal(importPayload({ source: 'word' }).error, 'Pilih file yang akan diimpor.')
  const big = { size: 30 * 1024 * 1024 }
  assert.equal(importPayload({ source: 'word', file: big }).error, 'Ukuran file maksimal 25 MB.')
  const file = { size: 1000 }
  assert.deepEqual(importPayload({ source: 'pdf', mode: 'append', file }).data, {
    source: 'pdf',
    mode: 'append',
    file,
  })
  assert.equal(importPayload({ source: 'links', text: '  ' }).error, 'Tulis minimal satu tautan.')
  assert.equal(
    importPayload({ source: 'bank', assessment: '3', questions: [] }).error,
    'Pilih minimal satu soal.',
  )
  assert.deepEqual(importPayload({ source: 'bank', mode: 'append', assessment: '3' }).data, {
    source: 'bank',
    mode: 'append',
    assessment: 3,
    questions: [],
  })
})
