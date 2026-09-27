import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BLUR_GRACE_MS, createExamMonitor } from './examMonitor.js'

// Dokumen & jendela tiruan dengan jam dan timer manual, agar bisa diuji tanpa browser.
function setup(requireFullscreen = false) {
  const doc = new EventTarget()
  doc.hidden = false
  doc.fullscreenElement = {}
  const win = new EventTarget()
  let clock = 0
  let timers = []
  const log = []
  const stop = createExamMonitor({
    requireFullscreen,
    doc,
    win,
    onViolation: (kind) => log.push(kind),
    now: () => clock,
    setTimer: (fn, ms) => {
      const timer = { fn, at: clock + ms }
      timers.push(timer)
      return timer
    },
    clearTimer: (timer) => {
      timers = timers.filter((t) => t !== timer)
    },
  })
  const advance = (ms) => {
    clock += ms
    for (const timer of timers.filter((t) => t.at <= clock)) {
      timers = timers.filter((t) => t !== timer)
      timer.fn()
    }
  }
  const fire = (target, type) => target.dispatchEvent(new Event(type))
  const hide = () => {
    doc.hidden = true
    fire(doc, 'visibilitychange')
  }
  return { doc, win, log, stop, advance, fire, hide }
}

test('pindah tab dihitung sekali (blur sebelumnya tidak ikut dihitung)', () => {
  const t = setup()
  t.fire(t.win, 'blur')
  t.hide()
  t.advance(5000)
  assert.deepEqual(t.log, ['hidden'])
})

test('fokus hilang sebentar (notifikasi) tidak dihitung', () => {
  const t = setup()
  t.fire(t.win, 'blur')
  t.advance(BLUR_GRACE_MS - 500)
  t.fire(t.win, 'focus')
  t.advance(5000)
  assert.deepEqual(t.log, [])
})

test('jendela lain lebih dari 2 detik dihitung', () => {
  const t = setup()
  t.fire(t.win, 'blur')
  t.advance(BLUR_GRACE_MS)
  assert.deepEqual(t.log, ['blur'])
})

test('keluar layar penuh dihitung hanya jika diwajibkan', () => {
  for (const [required, expected] of [
    [true, ['fullscreen_exit']],
    [false, []],
  ]) {
    const t = setup(required)
    t.doc.fullscreenElement = null
    t.fire(t.doc, 'fullscreenchange')
    assert.deepEqual(t.log, expected)
  }
})

test('pindah tab di layar penuh (dua kejadian sekaligus) dihitung sekali', () => {
  const t = setup(true)
  t.hide()
  t.doc.fullscreenElement = null
  t.fire(t.doc, 'fullscreenchange')
  assert.deepEqual(t.log, ['hidden'])
})

test('menutup/refresh tab meminta konfirmasi; berhenti memantau setelah selesai', () => {
  const t = setup()
  const before = new Event('beforeunload', { cancelable: true })
  t.win.dispatchEvent(before)
  assert.equal(before.defaultPrevented, true)
  t.stop()
  t.hide()
  const after = new Event('beforeunload', { cancelable: true })
  t.win.dispatchEvent(after)
  assert.deepEqual([t.log, after.defaultPrevented], [[], false])
})
