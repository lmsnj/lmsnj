import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cardNumbers,
  cardText,
  optionFromPosition,
  parseCard,
  readsFromResults,
  rosterStatus,
  tally,
  updateStreaks,
} from './qrQuiz.js'

// Posisi QR persegi di (100, 100) yang diputar `degrees` searah jarum jam (y layar ke bawah).
function rotated(degrees) {
  const rad = (degrees * Math.PI) / 180
  const point = (x, y) => ({
    x: 100 + x * Math.cos(rad) - y * Math.sin(rad),
    y: 100 + x * Math.sin(rad) + y * Math.cos(rad),
  })
  return {
    topLeft: point(-10, -10),
    topRight: point(10, -10),
    bottomRight: point(10, 10),
    bottomLeft: point(-10, 10),
  }
}

test('isi QR kartu', () => {
  assert.equal(cardText(12), 'SG:12')
  assert.equal(parseCard('SG:12'), 12)
  assert.equal(parseCard(' SG:7 '), 7)
  for (const bad of ['SG:0', 'SG:', 'sg:3', 'SG:1234', 'https://x', null]) {
    assert.equal(parseCard(bad), null, bad)
  }
})

test('arah QR menentukan huruf yang di atas', () => {
  assert.equal(optionFromPosition(rotated(0)), 0) // tegak: A di atas
  assert.equal(optionFromPosition(rotated(-90)), 1) // diputar berlawanan jarum jam: B (kanan) naik
  assert.equal(optionFromPosition(rotated(180)), 2) // terbalik: C di atas
  assert.equal(optionFromPosition(rotated(90)), 3) // searah jarum jam: D (kiri) naik
  // Kartu yang agak miring tetap terbaca benar.
  assert.equal(optionFromPosition(rotated(30)), 0)
  assert.equal(optionFromPosition(rotated(-60)), 1)
  assert.equal(optionFromPosition(rotated(-170)), 2)
  assert.equal(optionFromPosition(rotated(170)), 2)
  assert.equal(optionFromPosition(rotated(120)), 3)
})

test('hasil kamera: hanya kartu kuis, kartu ganda diambil sekali', () => {
  const reads = readsFromResults([
    { text: 'SG:3', position: rotated(0) },
    { text: 'bukan kartu', position: rotated(0) },
    { text: 'SG:3', position: rotated(180) },
    { text: 'SG:5', position: rotated(-90) },
  ])
  assert.deepEqual(reads, [
    { card: 3, option: 0 },
    { card: 5, option: 1 },
  ])
})

test('bacaan stabil butuh pilihan sama di dua gambar berturut-turut', () => {
  let state = updateStreaks(new Map(), [{ card: 1, option: 0 }])
  assert.deepEqual(state.stable, [])
  state = updateStreaks(state.streaks, [
    { card: 1, option: 0 },
    { card: 2, option: 3 },
  ])
  assert.deepEqual(state.stable, [{ card: 1, option: 0 }])
  // Gambar ketiga dengan pilihan sama tidak dilaporkan lagi; pilihan berubah = mulai dari awal.
  state = updateStreaks(state.streaks, [
    { card: 1, option: 0 },
    { card: 2, option: 1 },
  ])
  assert.deepEqual(state.stable, [])
  state = updateStreaks(state.streaks, [{ card: 2, option: 1 }])
  assert.deepEqual(state.stable, [{ card: 2, option: 1 }])
  assert.equal(state.streaks.has(1), false) // kartu hilang dari gambar = hitungan diulang
})

test('rekap jawaban & status siswa per soal', () => {
  const answers = [
    { question: 0, student: 1, option: 1, correct: true },
    { question: 0, student: 2, option: 0, correct: false },
    { question: 1, student: 1, option: 2, correct: false },
  ]
  assert.deepEqual(tally(answers, 0, 4), { counts: [1, 1, 0, 0], total: 2, correct: 1 })
  const roster = [
    { student: 1, number: 1 },
    { student: 2, number: 2 },
    { student: 3, number: null },
  ]
  const status = rosterStatus(roster, answers, 1)
  assert.equal(status.read, 1)
  assert.equal(status.total, 2)
  assert.equal(status.noCard, 1)
})

test('nomor kartu cetak dibatasi 1..200', () => {
  assert.deepEqual(cardNumbers(1, 3), [1, 2, 3])
  assert.deepEqual(cardNumbers(5, 2), [5])
  assert.equal(cardNumbers(0, 999).length, 200)
})
