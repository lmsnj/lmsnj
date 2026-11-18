import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluate, formatValue, parseExpression } from './expression.js'
import {
  blockText,
  countBlocks,
  findProblem,
  insertBlock,
  moveBlock,
  newBlock,
  parseProgram,
  removeBlock,
  runProgram,
  serializeProgram,
  updateBlock,
} from './program.js'

const calc = (text, vars = {}) => evaluate(parseExpression(text), new Map(Object.entries(vars)))

const block = (type, fields = {}) => ({ ...newBlock(type), ...fields })
const program = (...blocks) => ({ version: 1, blocks })

test('ekspresi: urutan operator, teks, logika', () => {
  assert.equal(calc('2 + 3 * 4'), 14)
  assert.equal(calc('(2 + 3) * 4'), 20)
  assert.equal(calc('2 ^ 3 ^ 2'), 512)
  assert.equal(calc('-2 ^ 2'), -4)
  assert.equal(calc('17 div 5'), 3)
  assert.equal(calc('17 mod 5'), 2)
  assert.equal(calc('17 % 5'), 2)
  assert.equal(calc('7 / 2'), 3.5)
  assert.equal(calc('"Halo " & Nama', { nama: 'Ani' }), 'Halo Ani')
  assert.equal(calc('"Nilai: " + n', { n: 8 }), 'Nilai: 8')
  assert.equal(calc('n >= 75 dan hadir', { n: 80, hadir: true }), true)
  assert.equal(calc('n = 5 atau tidak (n > 3)', { n: 4 }), false)
  assert.equal(calc('akar(16) + abs(-2) + bulatkan(2.6) + int(3.9) + panjang("abc")'), 15)
  assert.equal(formatValue(0.1 + 0.2), '0.3')
  assert.equal(formatValue(7), '7')
  assert.equal(formatValue(true), 'benar')
})

test('ekspresi: pesan error', () => {
  assert.throws(() => calc('x + 1'), /Variabel “x” belum diberi nilai/)
  assert.throws(() => calc('5 / 0'), /pembagian dengan nol/)
  assert.throws(() => calc('"a" * 2'), /bukan angka/)
  assert.throws(() => parseExpression('2 +'), /belum lengkap/)
  assert.throws(() => parseExpression('2 $ 3'), /Tanda “\$”/)
  assert.throws(() => parseExpression('cetak(2)'), /Fungsi “cetak”/)
  assert.throws(() => parseExpression(''), /kosong/)
})

test('menjalankan: masukan, proses, keluaran', () => {
  const prog = program(
    block('input', { variable: 'a' }),
    block('input', { variable: 'b' }),
    block('assign', { variable: 'c', expression: 'a + b' }),
    block('output', { expression: 'c' }),
  )
  assert.deepEqual(runProgram(prog, '3\n4'), { output: '7\n', error: null, blockId: null })
  assert.equal(runProgram(prog, '2,5\n1').output, '3.5\n')
  const nama = program(
    block('input', { variable: 'nama' }),
    block('output', { expression: '"Halo, " & nama & "!"' }),
  )
  assert.equal(runProgram(nama, 'Ani').output, 'Halo, Ani!\n')
})

test('menjalankan: jika, selama, ulangi untuk', () => {
  const lulus = program(
    block('input', { variable: 'nilai' }),
    block('if', {
      condition: 'nilai >= 75',
      yes: [block('output', { expression: '"Lulus"' })],
      no: [block('output', { expression: '"Remedial"' })],
    }),
  )
  assert.equal(runProgram(lulus, '80').output, 'Lulus\n')
  assert.equal(runProgram(lulus, '60').output, 'Remedial\n')

  const loop = program(
    block('assign', { variable: 'i', expression: '1' }),
    block('while', {
      condition: 'i <= 3',
      body: [
        block('output', { expression: 'i' }),
        block('assign', { variable: 'i', expression: 'i + 1' }),
      ],
    }),
  )
  assert.equal(runProgram(loop).output, '1\n2\n3\n')

  const sum = program(
    block('input', { variable: 'n' }),
    block('assign', { variable: 'total', expression: '0' }),
    block('for', {
      variable: 'i',
      from: '1',
      to: 'n',
      step: '',
      body: [block('assign', { variable: 'total', expression: 'total + i' })],
    }),
    block('output', { expression: 'total' }),
  )
  assert.equal(runProgram(sum, '10').output, '55\n')
  const down = program(
    block('for', {
      variable: 'k',
      from: '3',
      to: '1',
      step: '-1',
      body: [block('output', { expression: 'k' })],
    }),
  )
  assert.equal(runProgram(down).output, '3\n2\n1\n')
})

test('menjalankan: error ditandai di bloknya, perulangan tanpa akhir dihentikan', () => {
  const missing = block('output', { expression: 'x' })
  assert.deepEqual(runProgram(program(missing)), {
    output: '',
    error: 'Variabel “x” belum diberi nilai.',
    blockId: missing.id,
  })
  const input = block('input', { variable: 'a' })
  assert.equal(runProgram(program(input), '').blockId, input.id)
  const forever = block('while', { condition: 'benar', body: [] })
  const result = runProgram(program(forever))
  assert.match(result.error, /terlalu lama/)
  assert.equal(result.blockId, forever.id)
  const notBool = block('if', { condition: '5', yes: [], no: [] })
  assert.match(runProgram(program(notBool)).error, /benar\/salah/)
  const badName = block('assign', { variable: 'dan', expression: '1' })
  assert.equal(findProblem(program(badName)).blockId, badName.id)
  assert.match(findProblem(program()).message, /kosong/)
})

test('operasi pohon & simpan', () => {
  const a = block('output', { expression: '1' })
  const loop = block('while', { condition: 'benar', body: [] })
  let blocks = [a, loop]
  const inner = block('output', { expression: '2' })
  blocks = insertBlock(blocks, loop.id, 'body', 0, inner)
  assert.equal(blocks[1].body[0].id, inner.id)
  assert.equal(loop.body.length, 0, 'aslinya tidak berubah')
  blocks = updateBlock(blocks, inner.id, { expression: '3' })
  assert.equal(blocks[1].body[0].expression, '3')
  blocks = moveBlock(blocks, loop.id, -1)
  assert.equal(blocks[0].id, loop.id)
  assert.equal(countBlocks(blocks), 3)
  blocks = removeBlock(blocks, inner.id)
  assert.equal(countBlocks(blocks), 2)
  assert.deepEqual(parseProgram(serializeProgram({ blocks })).blocks, blocks)
  assert.deepEqual(parseProgram('rusak').blocks, [])
  assert.equal(
    blockText(block('for', { variable: 'i', from: '1', to: 'n', step: '2' })),
    'i ← 1 sampai n langkah 2',
  )
})

test('tata letak diagram: semua blok tergambar, tidak keluar batas', async () => {
  const { layoutProgram } = await import('./layout.js')
  const prog = program(
    block('input', { variable: 'n' }),
    block('if', {
      condition: 'n mod 2 = 0',
      yes: [block('output', { expression: '"Genap"' })],
      no: [],
    }),
    block('for', {
      variable: 'i',
      from: '1',
      to: 'n',
      body: [block('output', { expression: 'i' })],
    }),
    block('while', { condition: 'n > 0', body: [] }),
  )
  const layout = layoutProgram(prog)
  const shapes = layout.nodes.filter((n) => n.shape !== 'dot')
  assert.equal(shapes.length, 2 + countBlocks(prog.blocks)) // + Mulai & Selesai
  for (const node of layout.nodes) {
    assert.ok(node.x >= 0 && node.y >= 0, `${node.text} di dalam gambar`)
    assert.ok(node.x + node.w <= layout.width && node.y + node.h <= layout.height)
  }
  for (const line of layout.lines) {
    for (const [x, y] of line.points)
      assert.ok(x >= 0 && y >= 0 && x <= layout.width && y <= layout.height)
  }
  assert.deepEqual(layout.labels.map((l) => l.text).sort(), [
    'Selesai',
    'Tidak',
    'Tidak',
    'Ulangi',
    'Ya',
    'Ya',
  ])
})
