import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canAdvance } from './engine.js'
import {
  isSafeSimulationSrc,
  parseParams,
  parseSimulationMessage,
  simulationInit,
} from './simulation.js'

test('path simulasi hanya file .html di /mpi/', () => {
  assert.ok(isSafeSimulationSrc('/mpi/eksponen/sim/pangkat.html'))
  assert.ok(isSafeSimulationSrc('/mpi/eksponen/sim/sifat.html?mode=kali'))
  for (const bad of [
    'https://contoh.com/x.html',
    'http://contoh.com/x.html',
    '//contoh.com/mpi/x.html',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '/mpi/../index.html',
    '/api/x.html',
    '/mpi/eksponen/kasus-teh.svg',
    '',
    null,
  ]) {
    assert.ok(!isSafeSimulationSrc(bad), String(bad))
  }
})

test('pesan simulasi divalidasi', () => {
  assert.equal(parseSimulationMessage({ type: 'mpi:ready' }, false), null)
  assert.deepEqual(parseSimulationMessage({ type: 'mpi:ready' }, true), { type: 'ready' })
  assert.deepEqual(parseSimulationMessage({ type: 'mpi:resize', height: 90 }, true), {
    type: 'resize',
    height: 240,
  })
  assert.deepEqual(parseSimulationMessage({ type: 'mpi:resize', height: 9000 }, true), {
    type: 'resize',
    height: 1400,
  })
  assert.equal(parseSimulationMessage({ type: 'mpi:resize', height: '500' }, true), null)
  assert.deepEqual(parseSimulationMessage({ type: 'mpi:done', detail: { a: 3 } }, true), {
    type: 'done',
    detail: { a: 3 },
  })
  assert.equal(parseSimulationMessage({ type: 'lain' }, true), null)
  assert.equal(parseSimulationMessage('mpi:done', true), null)
  assert.equal(parseSimulationMessage({ type: 7 }, true), null)
})

test('init, params, dan aturan Lanjut', () => {
  assert.deepEqual(simulationInit({ target: 81 }), { type: 'mpi:init', params: { target: 81 } })
  assert.deepEqual(simulationInit([1]), { type: 'mpi:init', params: {} })
  assert.deepEqual(parseParams(''), { value: {} })
  assert.deepEqual(parseParams('{"target": 81}'), { value: { target: 81 } })
  assert.ok(parseParams('[1]').error)
  assert.ok(parseParams('{target: 81}').error)

  const sim = { kind: 'simulation', graded: false, require_done: true }
  assert.ok(!canAdvance(sim, undefined))
  assert.ok(canAdvance(sim, { done: true }))
  assert.ok(canAdvance(sim, { unblocked: true }))
  assert.ok(canAdvance({ ...sim, require_done: false }, undefined))
  assert.ok(canAdvance({ kind: 'text', graded: false }, undefined))
})
