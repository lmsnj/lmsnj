// Kasus uji bersama dengan interpreter Python (backend/.../plugins/flowgorithm/conformance.json):
// kedua interpreter wajib menghasilkan output & pesan kesalahan yang persis sama.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { checkTests, outputMatches, Runner, runProgram } from './interpreter.js'

const conformance = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../backend/apps/learning_media/plugins/flowgorithm/conformance.json',
      import.meta.url,
    ),
    'utf8',
  ),
)

for (const item of conformance.cases) {
  test(`kasus bersama: ${item.name}`, () => {
    const result = runProgram(item.program, item.inputs)
    assert.deepEqual(result.out, item.out)
    assert.equal(result.error, item.error)
  })
}

for (const item of conformance.checks) {
  test(`studi kasus acuan: ${item.name}`, () => {
    assert.ok(checkTests(item.program, item.tests, item.compare).every((r) => r.ok))
  })
}

test('Runner melangkah, meminta isian, dan menandai blok yang error', () => {
  const program = {
    body: [
      { id: 'a', t: 'decl', type: 'Integer', names: ['n'] },
      { id: 'b', t: 'input', target: 'n' },
      { id: 'c', t: 'output', expr: '10 / n' },
    ],
  }
  const runner = new Runner(program)
  assert.equal(runner.step(), 'paused')
  assert.equal(runner.current.id, 'a')
  assert.equal(runner.step(), 'paused')
  assert.equal(runner.step(), 'input')
  assert.equal(runner.inputName, 'n')
  assert.deepEqual(runner.vars(), [{ name: 'n', type: 'Integer', value: '0' }])
  assert.equal(runner.provide('0'), 'paused')
  assert.equal(runner.step(), 'error')
  assert.equal(runner.error, 'Tidak bisa dibagi nol.')
  assert.equal(runner.current.id, 'c')
  assert.equal(runProgram(program, ['0']).nodeId, 'c')
})

test('perbandingan output: tail & exact', () => {
  assert.ok(outputMatches(['Panjang?', 'Luas: 15'], ['luas:  15'], 'tail'))
  assert.ok(!outputMatches(['Panjang?', 'Luas: 15'], ['Luas: 15'], 'exact'))
  assert.ok(!outputMatches([], ['x'], 'tail'))
  assert.ok(outputMatches([], [], 'tail'))
})
