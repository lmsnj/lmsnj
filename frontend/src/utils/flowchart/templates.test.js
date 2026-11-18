import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EXERCISE_TEMPLATES, outputMatches } from '../codePractice.js'
import { newBlock, parseProgram, runProgram } from './program.js'

const block = (type, fields = {}) => ({ ...newBlock(type), ...fields })

// Jawaban contoh untuk setiap contoh soal flowchart: flowchart awal dari guru + blok yang dilengkapi
// siswa. Memastikan pemeriksaan di contoh soal memang bisa lulus.
const SOLUTIONS = {
  'Luas Persegi Panjang': (blocks) => [
    ...blocks,
    block('assign', { variable: 'luas', expression: 'panjang * lebar' }),
    block('output', { expression: 'luas' }),
  ],
  'Ganjil atau Genap': (blocks) => [
    ...blocks,
    block('if', {
      condition: 'n mod 2 = 0',
      yes: [block('output', { expression: '"Genap"' })],
      no: [block('output', { expression: '"Ganjil"' })],
    }),
  ],
  'Jumlah 1 sampai n': (blocks) => [
    ...blocks,
    block('for', {
      variable: 'i',
      from: '1',
      to: 'n',
      body: [block('assign', { variable: 'total', expression: 'total + i' })],
    }),
    block('output', { expression: 'total' }),
  ],
}

test('contoh soal flowchart: flowchart awal terbaca dan bisa diselesaikan', () => {
  const templates = EXERCISE_TEMPLATES.filter((t) => t.values.language === 'flowchart')
  assert.equal(templates.length, Object.keys(SOLUTIONS).length)
  for (const { values } of templates) {
    const starter = parseProgram(values.starter_code)
    assert.ok(starter.blocks.length > 0, `${values.title}: flowchart awal ada`)
    // Flowchart awal saja belum lulus (siswa harus melengkapinya).
    const unfinished = runProgram(starter, values.checks[0].input)
    assert.ok(!outputMatches(unfinished.output, values.checks[0].output))
    const solution = { version: 1, blocks: SOLUTIONS[values.title](starter.blocks) }
    for (const check of values.checks) {
      const result = runProgram(solution, check.input)
      assert.equal(result.error, null, `${values.title}: ${result.error}`)
      assert.ok(outputMatches(result.output, check.output), `${values.title}: ${check.input}`)
    }
  }
})
