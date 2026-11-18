import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildSrcdoc,
  checkLabel,
  checkProblem,
  emptyCheck,
  normalizeOutput,
  outputMatches,
  summarizeResults,
} from './codePractice.js'
import { codingState, moduleActivities } from './learningPath.js'

test('keluaran dibandingkan tanpa spasi akhir baris & baris kosong di akhir', () => {
  assert.equal(normalizeOutput('7  \r\n8\n\n\n'), '7\n8')
  assert.ok(outputMatches('Halo Dunia\n', 'Halo Dunia'))
  assert.ok(outputMatches('a \nb', 'a\nb\n'))
  // Spasi di awal baris & isi tetap diperhatikan.
  assert.ok(!outputMatches(' 7', '7'))
  assert.ok(!outputMatches('7\n\n8', '7\n8'))
})

test('kalimat pemeriksaan untuk siswa', () => {
  assert.equal(
    checkLabel({ input: '3\n4', output: '7' }, 'python'),
    'Masukan “3 ⏎ 4” menghasilkan “7”',
  )
  assert.equal(checkLabel({ input: '', output: 'Halo' }, 'python'), 'Program menampilkan “Halo”')
  assert.equal(
    checkLabel({ type: 'style', selector: 'body', property: 'color', value: 'red' }, 'html'),
    'Elemen body bergaya color: red',
  )
  assert.equal(
    checkLabel({ type: 'click', selector: 'button', target: '#hasil', value: 'Ok' }, 'html'),
    'Klik button, lalu #hasil berisi “Ok”',
  )
})

test('pemeriksaan yang belum lengkap', () => {
  assert.equal(checkProblem(emptyCheck('python'), 'python'), 'Isi keluaran yang diharapkan.')
  assert.equal(checkProblem({ input: '', output: 'x' }, 'python'), null)
  assert.match(
    checkProblem({ ...emptyCheck('html'), type: 'text', selector: 'h1' }, 'html'),
    /Nilai/,
  )
  assert.equal(checkProblem({ ...emptyCheck('html'), selector: 'h1' }, 'html'), null)
})

test('ringkasan hasil', () => {
  assert.deepEqual(summarizeResults([{ ok: true }, { ok: false }]), {
    passed: 1,
    total: 2,
    done: false,
  })
  assert.equal(summarizeResults([{ ok: true }]).done, true)
  assert.equal(summarizeResults([]).done, false)
})

test('skrip LMS disisipkan sebelum kode siswa', () => {
  const doc = buildSrcdoc('<h1>Halo</h1>')
  assert.ok(doc.startsWith('<script>'))
  assert.ok(doc.endsWith('<h1>Halo</h1>'))
  assert.ok(doc.indexOf('lms-run') < doc.indexOf('<h1>'))
})

test('keadaan Praktik di jalur belajar siswa', () => {
  const material = (checks, extra = {}) => ({
    material_type: 'link',
    objectives: [],
    code_exercise_count: 2,
    progress: { checks, code_passed: [5], ...extra },
  })
  let state = codingState(
    material([
      { key: 'opened', done: false },
      { key: 'coding', done: false },
    ]),
  )
  assert.equal(state.ready, false)
  assert.equal(state.blocked, true)
  assert.equal(state.passedCount, 1)

  state = codingState(
    material([
      { key: 'opened', done: true },
      { key: 'coding', done: false },
    ]),
  )
  assert.equal(state.ready, true)

  // Latihan Pemahaman belum lulus: Praktik belum bisa dikerjakan.
  const withPractice = {
    ...material([
      { key: 'opened', done: true },
      { key: 'coding', done: false },
    ]),
    practice_count: 3,
  }
  assert.equal(codingState(withPractice).ready, false)

  const done = material([
    { key: 'opened', done: true },
    { key: 'coding', done: true },
  ])
  assert.equal(codingState(done).blocked, false)
  const item = moduleActivities(done).find((i) => i.kind === 'coding')
  assert.equal(item.done, true)
  assert.equal(item.quizCount, 2)
  assert.equal(
    moduleActivities({ ...done, code_exercise_count: 0 }).some((i) => i.kind === 'coding'),
    false,
  )
})

test('PHP: masukan aman dan pesan error menjadi "Baris N"', async () => {
  const { phpPrelude, splitPhpOutput, isIoLanguage } = await import('./codePractice.js')
  assert.ok(isIoLanguage('php') && isIoLanguage('python') && !isIoLanguage('html'))
  const prelude = phpPrelude('$x "kutip"\n4')
  assert.ok(!prelude.includes('$x'), 'masukan tidak boleh muncul sebagai kode PHP')
  const encoded = prelude.match(/base64_decode\('([^']*)'\)/)[1]
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
  assert.equal(new TextDecoder().decode(bytes), '$x "kutip"\n4')

  assert.deepEqual(splitPhpOutput('7'), { output: '7', error: null })
  const warning = splitPhpOutput(
    'a\nWarning: Undefined variable $y in php-wasm run script on line 3\n',
  )
  assert.equal(warning.error, null)
  assert.match(warning.output, /^a\nBaris 3: Peringatan: Undefined variable \$y/)
  const parse = splitPhpOutput(
    '\nParse error: syntax error, unexpected token "echo" in php-wasm run script on line 4\n',
  )
  assert.equal(parse.error, 'Baris 4: Kesalahan penulisan: syntax error, unexpected token "echo"')
  const fatal = splitPhpOutput(
    'halo\nFatal error: Uncaught Exception: rusak in php-wasm run script:2\nStack trace:\n#0 {main}\n  thrown in php-wasm run script on line 2\n',
  )
  assert.deepEqual(fatal, { output: 'halo', error: 'Baris 2: Error: Exception: rusak' })
})
