import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { layoutProgram } from '../../../utils/flowchart/layout.js'
import { inputsByNode, runProgram } from './interpreter.js'
import {
  blankIndexes,
  countBlanks,
  fillBlanks,
  newNode,
  NODE_KINDS,
  nodeCount,
  paramsText,
  parseParams,
  toDiagram,
  withIds,
} from './program.js'

const conformance = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../backend/apps/learning_media/plugins/flowgorithm/conformance.json',
      import.meta.url,
    ),
    'utf8',
  ),
)

test('urutan bagian kosong sama dengan backend (kasus bersama)', () => {
  for (const item of conformance.blanks) {
    assert.equal(countBlanks(item.program), item.count)
    const filled = fillBlanks(item.program, item.answers)
    assert.deepEqual(filled, item.filled)
    assert.deepEqual(runProgram(filled).out, item.out)
  }
})

test('blankIndexes memberi nomor bagian kosong pertama per field', () => {
  const program = withIds({
    body: [
      { t: 'assign', target: '{{}}', expr: '{{}} + {{}}' },
      { t: 'output', expr: '{{}}' },
    ],
  })
  assert.deepEqual(blankIndexes(program), { 'b1:target': 0, 'b1:expr': 1, 'b2:expr': 3 })
})

test('semua blok baru bisa dijalankan & digambar', () => {
  const body = [{ t: 'decl', type: 'Integer', names: ['x', 'i'] }]
  for (const { t } of NODE_KINDS) {
    if (t === 'decl' || t === 'call') continue
    const node = newNode(t)
    if (t === 'while' || t === 'do') node.cond = 'false' // perulangan kosong harus bisa berhenti
    body.push(node)
  }
  const program = withIds({ body })
  assert.equal(nodeCount(program), body.length - 1) // komentar tidak dihitung
  assert.equal(runProgram(program, ['3']).error, '')
  const layout = layoutProgram({ blocks: toDiagram(program.body) })
  assert.ok(layout.nodes.some((n) => n.text === 'Integer x, i'))
  assert.ok(layout.nodes.some((n) => n.text === 'i = 1 sampai 5'))
})

test('parameter fungsi teks <-> daftar', () => {
  assert.deepEqual(parseParams('a: integer, b:Real, c'), [
    ['a', 'Integer'],
    ['b', 'Real'],
    ['c', 'Integer'],
  ])
  assert.equal(paramsText([['a', 'Integer']]), 'a: Integer')
})

test('tebak output: nilai isian ditulis di simbol Input diagram', () => {
  const program = withIds({
    body: [
      { t: 'decl', type: 'Integer', names: ['nilai'] },
      { t: 'input', target: 'nilai' },
      {
        t: 'if',
        cond: 'nilai >= 85',
        yes: [{ t: 'output', expr: '"A"' }],
        no: [{ t: 'input', target: 'nilai' }],
      },
    ],
  })
  const typed = inputsByNode(program, ['90'])
  assert.deepEqual(Object.values(typed), [['90']])
  const blocks = toDiagram(program.body, typed)
  assert.equal(blocks[1].label, 'Input nilai ← 90')
  assert.equal(blocks[2].no[0].label, 'Input nilai') // cabang yang tidak dijalankan tetap polos
  assert.deepEqual(inputsByNode(program, []), {}) // tanpa isian tidak macet
})
