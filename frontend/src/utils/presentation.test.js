import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addMinute,
  buildSlides,
  formatClock,
  keyAction,
  moveSlide,
  newTimer,
  presentationPath,
  resetTimer,
  stepZoom,
  timerLeft,
  toggleTimer,
  ZOOM_LEVELS,
  zoomIndexFor,
} from './presentation.js'

test('slide: pembuka, konten utama, konten tambahan, penutup', () => {
  const slides = buildSlides({
    title: 'Ekosistem',
    material_type: 'video',
    items: [
      { id: 7, title: 'Ringkasan', material_type: 'pdf' },
      { id: 9, title: 'Sumber', material_type: 'link' },
    ],
  })
  assert.deepEqual(
    slides.map((s) => s.id),
    ['title', 'main', 'item-7', 'item-9', 'end'],
  )
  assert.equal(slides[1].type, 'video')
  assert.equal(slides[2].item.id, 7)
  assert.equal(buildSlides({ title: 'A', material_type: 'link' }).length, 3)
})

test('tombol keyboard & remote presenter', () => {
  assert.equal(keyAction('ArrowRight'), 'next')
  assert.equal(keyAction('PageDown'), 'next')
  assert.equal(keyAction(' '), 'next')
  assert.equal(keyAction('PageUp'), 'prev')
  assert.equal(keyAction('b'), 'black')
  assert.equal(keyAction('x'), null)
  assert.equal(keyAction('ArrowRight', 'body', true), null) // Ctrl/Alt + panah = milik browser
  // Spasi/Enter di tombol = menekan tombol itu, bukan pindah slide.
  assert.equal(keyAction(' ', 'control'), null)
  assert.equal(keyAction('ArrowRight', 'control'), 'next')
  // Saat mengetik / di dalam soal media, hanya tombol remote.
  assert.equal(keyAction('ArrowLeft', 'typing'), null)
  assert.equal(keyAction('b', 'typing'), 'black')
  assert.equal(keyAction('PageDown', 'frame'), 'next')
  assert.equal(keyAction(' ', 'frame'), null)
})

test('pindah slide tidak keluar batas', () => {
  assert.equal(moveSlide(0, 'prev', 4), 0)
  assert.equal(moveSlide(3, 'next', 4), 3)
  assert.equal(moveSlide(1, 'next', 4), 2)
  assert.equal(moveSlide(2, 'first', 4), 0)
  assert.equal(moveSlide(0, 'last', 4), 3)
  assert.equal(moveSlide(2, 'black', 4), 2)
})

test('ukuran huruf -> perbesaran', () => {
  assert.equal(ZOOM_LEVELS[zoomIndexFor('normal')], 1)
  assert.equal(ZOOM_LEVELS[zoomIndexFor('sangat_besar')], 1.5)
  assert.equal(ZOOM_LEVELS[zoomIndexFor(undefined)], 1.3)
  assert.equal(stepZoom(0, -1), 0)
  assert.equal(stepZoom(ZOOM_LEVELS.length - 1, 1), ZOOM_LEVELS.length - 1)
})

test('timer hitung mundur', () => {
  let timer = newTimer(5)
  assert.equal(timerLeft(timer, 0), 300)
  timer = toggleTimer(timer, 1000)
  assert.equal(timerLeft(timer, 61_500), 240)
  timer = toggleTimer(timer, 61_500) // jeda
  assert.equal(timerLeft(timer, 999_999), 240)
  timer = addMinute(timer, 0)
  assert.equal(timer.left, 300)
  timer = addMinute(timer, 0, -10)
  assert.equal(timer.left, 0)
  // Habis lalu dimulai lagi = dari awal.
  timer = toggleTimer(timer, 5000)
  assert.equal(timerLeft(timer, 5000), 300)
  assert.equal(timerLeft(timer, 5000 + 400_000), 0)
  assert.equal(resetTimer(timer).runningSince, null)
  assert.equal(newTimer('abc').total, 300)
  assert.equal(addMinute(newTimer(1), 0, 2).total, 180)
})

test('format jam', () => {
  assert.equal(formatClock(0), '00:00')
  assert.equal(formatClock(65), '01:05')
  assert.equal(formatClock(-3), '00:00')
  assert.equal(formatClock(3600), '60:00')
})

test('alamat presentasi per tipe materi', () => {
  assert.equal(presentationPath({ id: 4, material_type: 'pdf' }), '/presentasi/materi/4')
  assert.equal(presentationPath({ id: 5, material_type: 'media' }), '/presentasi/media/5')
})
