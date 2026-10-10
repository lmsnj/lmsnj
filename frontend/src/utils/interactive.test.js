import assert from 'node:assert/strict'
import { test } from 'node:test'
import { answerPayload, fromServerDraft, isAnswered } from './exam.js'
import {
  checkpointGuard,
  clearGap,
  connectPair,
  disconnectPair,
  emptyCheckpoint,
  emptySpec,
  formatTime,
  isCheckpointDone,
  isComplete,
  parseGaps,
  parseTime,
  placeOption,
  previewContent,
  seededShuffle,
  setGap,
  specError,
  templateError,
} from './interactive.js'

test('parseGaps memisahkan kalimat dan jawaban alternatif', () => {
  assert.deepEqual(parseGaps('HTML singkatan dari [[HyperText| Hypertext ]] Markup [[Language]]'), {
    parts: ['HTML singkatan dari ', ' Markup ', ''],
    gaps: [['HyperText', 'Hypertext'], ['Language']],
  })
  assert.deepEqual(parseGaps('tanpa celah'), { parts: ['tanpa celah'], gaps: [] })
})

test('templateError meminta minimal satu [[jawaban]] yang terisi', () => {
  assert.match(templateError('tanpa celah'), /minimal satu/)
  assert.match(templateError('kosong [[ ]]'), /kosong/)
  assert.equal(templateError('Ibu kota [[Jakarta]]'), '')
  assert.match(templateError('[[a|b]]', { single: true }), /Satu jawaban/)
  assert.equal(specError('fill_blank', { template: 'a [[b]]' }), '')
})

const fill = {
  id: 7,
  kind: 'fill_blank',
  content: previewContent('fill_blank', { template: 'HTML [[HyperText]] Markup [[Language]]' }),
}

test('isian singkat terjawab hanya jika semua celah terisi', () => {
  assert.equal(isComplete('fill_blank', fill.content, {}), false)
  assert.equal(isAnswered(fill, { gaps: ['HyperText', '  '] }), false)
  assert.equal(isAnswered(fill, setGap({ gaps: ['HyperText'] }, 2, 1, 'Language')), true)
})

test('setGap mengisi celah tanpa mengubah celah lain', () => {
  assert.deepEqual(setGap(undefined, 3, 1, 'x'), { gaps: ['', 'x', ''] })
})

test('jawaban interaktif dikirim sebagai response dan dipulihkan dari draft server', () => {
  const value = { gaps: ['HyperText', 'Language'] }
  assert.deepEqual(answerPayload(fill, value, true), {
    question: 7,
    response: value,
    flagged: true,
  })
  assert.deepEqual(answerPayload(fill, undefined), { question: 7, response: {} })
  const restored = fromServerDraft([fill], [{ question: 7, response: value, flagged: true }])
  assert.deepEqual(restored, { answers: { 7: value }, flags: { 7: true } })
})

test('tarik & lepas: menaruh pilihan memindahkannya dari celah lain, ketuk = kosongkan', () => {
  let value = placeOption({}, 2, 0, 'a')
  assert.deepEqual(value, { gaps: ['a', null] })
  value = placeOption(value, 2, 1, 'a')
  assert.deepEqual(value, { gaps: [null, 'a'] })
  value = placeOption(value, 2, 0, 'b')
  assert.equal(isComplete('drag_drop', { parts: ['', ' ', ''] }, value), true)
  assert.deepEqual(clearGap(value, 2, 1), { gaps: ['b', null] })
})

test('pratinjau tarik & lepas: pilihan = jawaban + pengecoh, diacak tetap', () => {
  const spec = { template: 'Ibu kota [[Jakarta]] di [[Jawa]]', distractors: ['Bali'] }
  const content = previewContent('drag_drop', spec)
  assert.deepEqual(content.options.map((o) => o.text).sort(), ['Bali', 'Jakarta', 'Jawa'])
  assert.deepEqual(previewContent('drag_drop', spec).options, content.options)
  assert.deepEqual(seededShuffle([1, 2, 3, 4], 'x'), seededShuffle([1, 2, 3, 4], 'x'))
})

test('validasi tarik & lepas: satu jawaban per celah, pengecoh kosong harus bergambar', () => {
  assert.match(specError('drag_drop', { template: '[[a|b]]' }), /Satu jawaban/)
  const spec = { template: '[[a]]', distractors: [''] }
  assert.match(specError('drag_drop', spec, { hasImage: () => false }), /Pengecoh nomor 1/)
  assert.equal(specError('drag_drop', spec, { hasImage: (key) => key === 'choice-1' }), '')
})

test('menjodohkan: hubungkan, ganti, dan batalkan pasangan', () => {
  let value = connectPair({}, 'k1', 'a')
  value = connectPair(value, 'k2', 'a') // jawaban kanan dipakai ulang -> pasangan lama lepas
  assert.deepEqual(value, { pairs: { k2: 'a' } })
  value = connectPair(value, 'k1', 'b')
  const content = { left: [{ id: 'k1' }, { id: 'k2' }] }
  assert.equal(isComplete('matching', content, value), true)
  assert.deepEqual(disconnectPair(value, 'k2'), { pairs: { k1: 'b' } })
  assert.equal(isComplete('matching', content, disconnectPair(value, 'k2')), false)
})

test('validasi menjodohkan', () => {
  const pair = (left, right) => ({ left, right })
  assert.match(specError('matching', { pairs: [pair('a', 'b')] }), /2 sampai 10/)
  assert.match(specError('matching', { pairs: [pair('a', 'b'), pair('c', '')] }), /nomor 2/)
  assert.match(specError('matching', { pairs: [pair('a', 'b'), pair('A ', 'c')] }), /kiri/)
  const spec = { pairs: [pair('a', 'b'), pair('c', 'd')], distractors: ['B'] }
  assert.match(specError('matching', spec), /kanan/)
  assert.equal(specError('matching', { ...spec, distractors: ['e'] }), '')
  assert.equal(previewContent('matching', { ...spec, distractors: ['e'] }).right.length, 3)
})

test('waktu video: format dan baca menit:detik', () => {
  assert.equal(formatTime(65), '1:05')
  assert.equal(formatTime(3725), '1:02:05')
  assert.equal(parseTime('1:05'), 65)
  assert.equal(parseTime('90'), 90)
  assert.equal(parseTime('0:01:05'), 65)
  assert.equal(parseTime('1:75'), null)
  assert.equal(parseTime('abc'), null)
})

const cps = [
  { id: 'a', time: 10, kind: 'choice', choices: ['x', 'y'], required: true },
  { id: 'b', time: 30, kind: 'choice', choices: ['x', 'y'], required: false },
]

test('checkpoint selesai: dijawab, atau dilewati jika opsional', () => {
  assert.equal(isCheckpointDone(cps[0], { checkpoints: { a: { choice: 1 } } }), true)
  assert.equal(isCheckpointDone(cps[0], { skipped: ['a'] }), false) // wajib tidak bisa dilewati
  assert.equal(isCheckpointDone(cps[1], { skipped: ['b'] }), true)
  const video = { kind: 'interactive_video', content: { checkpoints: cps } }
  assert.equal(isAnswered(video, { checkpoints: { a: { choice: 0 } } }), false)
  assert.equal(isAnswered(video, { checkpoints: { a: { choice: 0 } }, skipped: ['b'] }), true)
})

test('video berhenti saat diputar melewati checkpoint yang belum dijawab', () => {
  const none = () => false
  const base = { checkpoints: cps, isDone: none }
  assert.equal(checkpointGuard({ ...base, time: 9.8, last: 9.5, allowSeek: true }), null)
  assert.deepEqual(checkpointGuard({ ...base, time: 10.1, last: 9.8, allowSeek: true }), {
    checkpoint: cps[0],
    rewind: false,
  })
})

test('tanpa izin lompat: menggeser melewati checkpoint dikembalikan ke checkpoint itu', () => {
  const base = { checkpoints: cps, isDone: () => false, allowSeek: false }
  assert.deepEqual(checkpointGuard({ ...base, time: 45, last: 5 }), {
    checkpoint: cps[0],
    rewind: true,
  })
  // Checkpoint pertama sudah dijawab: yang dikejar checkpoint kedua.
  const done = (cp) => cp.id === 'a'
  assert.equal(checkpointGuard({ ...base, isDone: done, time: 45, last: 5 }).checkpoint, cps[1])
  // Dengan izin lompat, menggeser jauh tidak menghentikan video.
  assert.equal(checkpointGuard({ ...base, allowSeek: true, time: 45, last: 5 }), null)
})

test('validasi video: link YouTube, durasi, dan isi checkpoint', () => {
  const choice = {
    ...emptyCheckpoint('choice', 10),
    text: 'Tanya',
    choices: ['a', 'b'],
    correct_choice: 0,
  }
  const spec = {
    ...emptySpec('interactive_video'),
    url: 'https://youtu.be/dQw4w9WgXcQ',
    duration: 60,
  }
  assert.match(specError('interactive_video', { ...spec, url: 'https://vimeo.com/1' }), /YouTube/)
  assert.match(specError('interactive_video', spec), /minimal satu checkpoint/)
  assert.equal(specError('interactive_video', { ...spec, checkpoints: [choice] }), '')
  const late = { ...choice, time: 61 }
  assert.match(specError('interactive_video', { ...spec, checkpoints: [late] }), /melebihi durasi/)
  const noKey = { ...choice, correct_choice: null }
  assert.match(specError('interactive_video', { ...spec, checkpoints: [noKey] }), /nomor 1: tandai/)
  const fill = { ...emptyCheckpoint('fill_blank', 20), template: 'tanpa celah' }
  assert.match(specError('interactive_video', { ...spec, checkpoints: [choice, fill] }), /nomor 2/)
  const file = { ...spec, source: 'file', checkpoints: [choice] }
  assert.match(specError('interactive_video', file), /file video/)
  assert.equal(specError('interactive_video', file, { hasVideo: true }), '')
  const preview = previewContent('interactive_video', { ...spec, checkpoints: [choice] })
  assert.equal(preview.youtube_id, 'dQw4w9WgXcQ')
  assert.equal(preview.total_points, 1)
})
