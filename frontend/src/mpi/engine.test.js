import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  directImageUrl,
  achievements,
  canAdvance,
  clampScale,
  flattenStations,
  initialValue,
  localStepState,
  isAnswered,
  isNetworkError,
  nextStation,
  personalize,
  queueAdd,
  queueRemove,
  speakableText,
  startIndex,
  stationProgress,
  stationStatus,
  visibleHints,
} from './engine.js'

const content = {
  parts: [
    {
      id: 'p1',
      title: 'Dasar',
      stations: [
        { id: 's1', steps: [] },
        { id: 's2', steps: [] },
      ],
    },
    { id: 'p2', title: 'Lanjutan', stations: [{ id: 's3', steps: [] }] },
  ],
}

test('personalize mengganti penanda yang dikenal saja', () => {
  const user = { full_name: 'Ahmad Fauzi', classroom_name: 'X RPL 1' }
  assert.equal(
    personalize('Halo {nama_panggilan} ({nama_siswa}) dari {kelas} {lain}', user),
    'Halo Ahmad (Ahmad Fauzi) dari X RPL 1 {lain}',
  )
  assert.equal(personalize('Hai {nama_siswa}', null), 'Hai kamu')
})

test('flattenStations memberi nomor global', () => {
  const list = flattenStations(content)
  assert.deepEqual(
    list.map((s) => [s.id, s.number, s.partTitle]),
    [
      ['s1', 1, 'Dasar'],
      ['s2', 2, 'Dasar'],
      ['s3', 3, 'Lanjutan'],
    ],
  )
})

test('stationStatus', () => {
  assert.equal(stationStatus({ locked: true }), 'locked')
  assert.equal(stationStatus({ completed: true }), 'done')
  assert.equal(stationStatus({ last_step_id: 'a', run: {} }), 'progress')
  assert.equal(stationStatus({ run: {} }), 'open')
})

test('nextStation melewati yang terkunci & selesai', () => {
  const stations = flattenStations(content)
  const states = { s1: { completed: true }, s2: { locked: true }, s3: {} }
  assert.equal(nextStation(stations, states, 's1').id, 's3')
  assert.equal(nextStation(stations, states, 's3'), null)
})

test('isAnswered per jenis', () => {
  assert.equal(isAnswered({ kind: 'choice' }, { choice: 'x' }), true)
  assert.equal(isAnswered({ kind: 'true_false' }, { answer: false }), true)
  assert.equal(isAnswered({ kind: 'ordering', items: [1, 2] }, { order: ['a'] }), false)
  const categorize = { kind: 'categorize', items: [{ id: 'a' }, { id: 'b' }] }
  assert.equal(isAnswered(categorize, { items: { a: 'k' } }), false)
  assert.equal(isAnswered(categorize, { items: { a: 'k', b: 'k' } }), true)
  assert.equal(isAnswered({ kind: 'fill_blank', parts: ['a', 'b'] }, { gaps: [' '] }), false)
  assert.equal(isAnswered({ kind: 'fill_blank', parts: ['a', 'b'] }, { gaps: ['1'] }), true)
  assert.equal(isAnswered({ kind: 'matching', left: [1, 2] }, { pairs: { a: 'b' } }), false)
  assert.equal(isAnswered({ kind: 'hotspot' }, null), false)
})

test('canAdvance & stationProgress', () => {
  const station = {
    steps: [
      { id: 'a', graded: true },
      { id: 'b', graded: false },
      { id: 'c', graded: true },
    ],
  }
  assert.equal(canAdvance(station.steps[1], null), true)
  assert.equal(canAdvance(station.steps[0], { mistakes: 2 }), false)
  assert.equal(canAdvance(station.steps[0], { done: true }), true)
  assert.deepEqual(stationProgress(station, { a: { done: true } }), {
    done: 1,
    total: 2,
    complete: false,
  })
  assert.equal(startIndex(station, { last_step_id: 'c' }), 2)
  assert.equal(startIndex(station, { last_step_id: 'hilang' }), 0)
})

test('visibleHints & speakableText', () => {
  assert.deepEqual(visibleHints({ hints: ['a', 'b'] }, 1), ['a'])
  const text = speakableText(
    { kind: 'dialog', title: 'Halo', lines: [{ text: 'Aku **Bita**, {nama_panggilan}!' }] },
    { full_name: 'Siti Aminah' },
  )
  assert.equal(text, 'Halo. Aku Bita, Siti!')
  assert.equal(speakableText({ kind: 'text', body: 'Rumus $a+b$ ini' }), 'Rumus rumus ini')
})

test('antrean offline tidak ganda', () => {
  let queue = queueAdd([], { uid: '1', data: 'a' })
  queue = queueAdd(queue, { uid: '1', data: 'b' })
  queue = queueAdd(queue, { uid: '2', data: 'c' })
  assert.deepEqual(
    queue.map((q) => q.data),
    ['b', 'c'],
  )
  assert.deepEqual(
    queueRemove(queue, '1').map((q) => q.uid),
    ['2'],
  )
  assert.equal(isNetworkError({ message: 'Network Error' }), true)
  assert.equal(isNetworkError({ response: { status: 400 } }), false)
})

test('clampScale & achievements', () => {
  assert.equal(clampScale(9), 3)
  assert.equal(clampScale(undefined), 1)
  const data = {
    content,
    stations: {
      s1: { completed: true, stars: 3, time_spent: 120 },
      s2: { completed: true, stars: 2 },
      s3: {},
    },
  }
  assert.deepEqual(achievements(data), {
    stars: 5,
    maxStars: 9,
    done: 2,
    total: 3,
    perfect: 1,
    minutes: 2,
  })
})

test('initialValue urutkan = urutan yang tampil', () => {
  const step = { kind: 'ordering', items: [{ id: 'b' }, { id: 'a' }] }
  assert.deepEqual(initialValue(step), { order: ['b', 'a'] })
  assert.equal(isAnswered(step, initialValue(step)), true)
  assert.equal(initialValue({ kind: 'choice' }), undefined)
})

test('localStepState mengikuti aturan server', () => {
  let state = localStepState(undefined, { correct: false, hintLevel: 1 })
  assert.deepEqual(state, { hints: 1, mistakes: 1 })
  state = localStepState(state, { correct: true, hintLevel: 2 })
  assert.deepEqual(state, { hints: 2, mistakes: 1, done: true })
  assert.deepEqual(localStepState(state, { correct: false }), state)
  assert.deepEqual(localStepState({}, { revealed: true, hintCount: 2 }), {
    hints: 2,
    done: true,
    revealed: true,
  })
})

test('directImageUrl menerima https dan gambar bawaan /mpi saja', () => {
  assert.equal(directImageUrl('https://contoh.id/a.png'), 'https://contoh.id/a.png')
  assert.equal(directImageUrl('/mpi/flowgorithm/console.svg'), '/mpi/flowgorithm/console.svg')
  for (const bad of [
    '/mpi/../index.html',
    '/api/x.png',
    '//evil.id/a.png',
    'asset:3',
    'javascript:x',
    '',
  ]) {
    assert.equal(directImageUrl(bad), null, bad)
  }
})
