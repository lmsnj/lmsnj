import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contentOrigin, h5pMessage, initMessage, isSafeEmbed, parseMessage } from './bridge.js'

const ORIGIN = 'https://konten.contoh.id'
const ok = (data, extra = {}) => ({
  origin: ORIGIN,
  fromFrame: true,
  data: { source: 'mpi-content', nonce: 'n1', ...data },
  ...extra,
})

test('hanya https dan origin berbeda dari LMS', () => {
  assert.equal(contentOrigin('https://konten.contoh.id/a/b.html?x=1'), ORIGIN)
  assert.ok(isSafeEmbed('https://h5p.org/h5p/embed/1', 'https://smknj.sigmateknologi.my.id'))
  assert.ok(
    !isSafeEmbed('https://smknj.sigmateknologi.my.id/x', 'https://smknj.sigmateknologi.my.id'),
  )
  assert.ok(!isSafeEmbed('http://h5p.org/x', 'https://lms.id'))
  assert.ok(!isSafeEmbed('javascript:alert(1)', 'https://lms.id'))
  assert.ok(!isSafeEmbed('https://u:p@h5p.org/x', 'https://lms.id'))
  assert.ok(!isSafeEmbed('http://127.0.0.2:8090/a.html', 'http://smknj.localhost:5173'))
  assert.ok(isSafeEmbed('http://127.0.0.2:8090/a.html', 'http://smknj.localhost:5173', true))
})

test('pesan bridge divalidasi dan dibersihkan', () => {
  assert.deepEqual(parseMessage(ok({ type: 'mpi:complete', score: 8, max: 10 }), ORIGIN, 'n1'), {
    type: 'complete',
    score: 8,
    max: 10,
  })
  assert.deepEqual(parseMessage(ok({ type: 'mpi:complete', score: 'x' }), ORIGIN, 'n1'), {
    type: 'complete',
    score: null,
    max: null,
  })
  assert.deepEqual(
    parseMessage(ok({ type: 'mpi:complete', score: 12, max: 10 }), ORIGIN, 'n1').score,
    10,
  )
  assert.deepEqual(parseMessage(ok({ type: 'mpi:resize', height: 5000 }), ORIGIN, 'n1'), {
    type: 'resize',
    height: 1200,
  })
  assert.deepEqual(parseMessage(ok({ type: 'mpi:progress', value: 2 }), ORIGIN, 'n1'), {
    type: 'progress',
    value: 1,
  })
  // Ditolak: origin lain, bukan dari iframe, nonce salah, jenis tak dikenal, sumber salah.
  assert.equal(
    parseMessage(ok({ type: 'mpi:complete' }, { origin: 'https://jahat.id' }), ORIGIN, 'n1'),
    null,
  )
  assert.equal(parseMessage(ok({ type: 'mpi:complete' }, { fromFrame: false }), ORIGIN, 'n1'), null)
  assert.equal(parseMessage(ok({ type: 'mpi:complete' }), ORIGIN, 'lain'), null)
  assert.equal(parseMessage(ok({ type: 'mpi:hapus' }), ORIGIN, 'n1'), null)
  assert.equal(
    parseMessage({ origin: ORIGIN, fromFrame: true, data: 'mpi:complete' }, ORIGIN, 'n1'),
    null,
  )
  assert.equal(initMessage('n1', 'l1', 'Rani').user.nickname, 'Rani')
})

test('protokol resizer H5P', () => {
  const h5p = (data) => ({ origin: ORIGIN, fromFrame: true, data: { context: 'h5p', ...data } })
  assert.deepEqual(h5pMessage(h5p({ action: 'hello' }), ORIGIN).reply, {
    context: 'h5p',
    action: 'hello',
  })
  assert.deepEqual(h5pMessage(h5p({ action: 'prepareResize', scrollHeight: 640 }), ORIGIN), {
    reply: { context: 'h5p', action: 'resizePrepared' },
    height: 640,
  })
  assert.equal(h5pMessage(h5p({ action: 'resize', scrollHeight: 90 }), ORIGIN).height, 200)
  assert.equal(h5pMessage({ ...h5p({ action: 'hello' }), origin: 'https://lain.id' }, ORIGIN), null)
})
