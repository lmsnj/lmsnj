import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  answerPayload,
  choiceKeyIndex,
  fromServerDraft,
  instructionFor,
  isAnswered,
  questionStatus,
  restoreExamState,
  setCategory,
  sharedStimuli,
  toggleChoice,
  toPayload,
} from './exam.js'

const choice = { id: 1, kind: 'choice', choices: ['a', 'b', 'c'] }
const multiple = { id: 2, kind: 'multiple', choices: ['a', 'b', 'c'] }
const category = {
  id: 3,
  kind: 'category',
  choices: ['p1', 'p2'],
  category_labels: ['Sesuai', 'Tidak sesuai'],
}
const essay = { id: 4, kind: 'essay', choices: [] }
const questions = [choice, multiple, category, essay]

test('status terjawab per jenis soal', () => {
  assert.equal(isAnswered(choice, 0), true)
  assert.equal(isAnswered(choice, null), false)
  assert.equal(isAnswered(multiple, []), false)
  assert.equal(isAnswered(multiple, [1]), true)
  assert.equal(isAnswered(category, [0, null]), false) // semua pernyataan wajib dijawab
  assert.equal(isAnswered(category, [0, 1]), true)
  assert.equal(isAnswered(essay, '   '), false)
})

test('warna nomor soal: aktif > ragu-ragu > terjawab > kosong', () => {
  assert.equal(questionStatus({ answered: true, flagged: true, current: true }), 'current')
  assert.equal(questionStatus({ answered: true, flagged: true }), 'flagged')
  assert.equal(questionStatus({ answered: true }), 'answered')
  assert.equal(questionStatus({}), 'empty')
})

test('petunjuk pengerjaan otomatis menyesuaikan bentuk soal', () => {
  assert.equal(instructionFor(choice), 'Silakan klik pilihan jawabanmu.')
  assert.equal(instructionFor(multiple), 'Pilih lebih dari satu jawaban yang benar.')
  assert.equal(
    instructionFor(category),
    'Tentukan Sesuai atau Tidak sesuai untuk setiap pernyataan.',
  )
  assert.equal(
    instructionFor({ ...category, category_labels: [] }),
    'Tentukan Benar atau Salah untuk setiap pernyataan.',
  )
})

test('centang PG kompleks & isi kategori', () => {
  assert.deepEqual(toggleChoice(undefined, 2), [2])
  assert.deepEqual(toggleChoice([2], 0), [0, 2])
  assert.deepEqual(toggleChoice([0, 2], 2), [0])
  assert.deepEqual(setCategory(category, undefined, 1, 0), [null, 0])
  assert.deepEqual(setCategory(category, [1, 0], 0, 0), [0, 0])
})

test('tombol A-E memilih opsi', () => {
  assert.deepEqual(['a', 'B', 'e', 'f', 'Enter', ''].map(choiceKeyIndex), [0, 1, 4, -1, -1, -1])
})

test('soal grup memakai stimulus soal pertama grup', () => {
  const list = [
    { id: 1, group: '' },
    { id: 2, group: 'G1', stimulus: 'Bacaan' },
    { id: 3, group: 'G1', stimulus: '' },
    { id: 4, group: 'G2', stimulus: 'Hanya satu soal' },
  ]
  const shared = sharedStimuli(list)
  assert.equal(shared[0], null)
  assert.deepEqual(shared[2], { source: list[1], from: 2, to: 3 })
  assert.equal(shared[1].source, list[1])
  assert.equal(shared[3], null) // grup berisi satu soal = soal biasa
})

test('format jawaban untuk API', () => {
  assert.deepEqual(answerPayload(choice, undefined), { question: 1, choice: null })
  assert.deepEqual(answerPayload(multiple, [0, 2], true), {
    question: 2,
    choices: [0, 2],
    flagged: true,
  })
  assert.deepEqual(answerPayload(category, [1]), { question: 3, choices: [1, null] })
  assert.deepEqual(answerPayload(essay, 'jawab'), { question: 4, text: 'jawab' })
  assert.equal(toPayload(questions, {}, { 4: true })[3].flagged, true)
})

test('pulihkan jawaban: perangkat dulu, lalu server; format lama tetap terbaca', () => {
  const draft = [
    { question: 1, choice: 2, choices: [], text: '' },
    { question: 2, choice: null, choices: [0, 1], text: '', flagged: true },
    { question: 4, choice: null, choices: [], text: 'esai' },
  ]
  assert.deepEqual(fromServerDraft(questions, draft), {
    answers: { 1: 2, 2: [0, 1], 4: 'esai' },
    flags: { 2: true },
  })
  const local = { answers: { 1: 0 }, flags: { 1: true }, current: 99 }
  assert.deepEqual(restoreExamState(local, questions, draft), { ...local, current: 3 })
  assert.deepEqual(restoreExamState({ 1: 1 }, questions, draft), {
    answers: { 1: 1 },
    flags: {},
    current: 0,
  })
  assert.equal(restoreExamState(null, questions, draft).answers[4], 'esai')
})
