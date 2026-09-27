import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  hasArabic,
  insertAt,
  parseBlocks,
  parseEmphasis,
  parseRichText,
  splitArabic,
  splitCells,
} from './richText.js'

// Harakat = karakter penanda Unicode (kategori Mn).
const harakat = (text) => [...text].filter((c) => /\p{Mn}/u.test(c)).length
const ARABIC = 'إِلَى أَيْنَ ذَهَبَ أَحْمَدُ؟'

test('rumus dalam kalimat ($...$)', () => {
  assert.deepEqual(parseRichText(String.raw`Nilai $\frac{1}{2}$ adalah`), [
    { type: 'text', value: 'Nilai ' },
    { type: 'math', value: String.raw`\frac{1}{2}`, display: false },
    { type: 'text', value: ' adalah' },
  ])
})

test('rumus di baris sendiri ($$...$$), boleh berisi baris baru', () => {
  const parts = parseRichText(String.raw`Dari $$\begin{cases} x + y = 5 \\ x - y = 1 \end{cases}$$`)
  assert.equal(parts[1].type, 'math')
  assert.equal(parts[1].display, true)
  assert.ok(parts[1].value.startsWith(String.raw`\begin{cases}`))
})

test('tanda dolar uang bukan rumus; \\$ = dolar biasa', () => {
  assert.deepEqual(parseRichText('Harga $5 dan $10'), [{ type: 'text', value: 'Harga $5 dan $10' }])
  assert.deepEqual(parseRichText(String.raw`Rp\$1`), [{ type: 'text', value: 'Rp$1' }])
  assert.deepEqual(parseRichText('biaya $3'), [{ type: 'text', value: 'biaya $3' }])
})

test('teks Arab berharakat tetap satu potongan dan harakat utuh', () => {
  const runs = splitArabic(ARABIC)
  assert.deepEqual(runs, [{ arabic: true, value: ARABIC }])
  assert.equal(harakat(runs[0].value), harakat(ARABIC))
})

test('teks campuran Indonesia-Arab dipisah tanpa kehilangan karakter', () => {
  const text = 'Arti kata «الْمَدْرَسَةُ» adalah sekolah'
  const runs = splitArabic(text)
  assert.deepEqual(
    runs.filter((r) => r.arabic).map((r) => r.value),
    ['الْمَدْرَسَةُ'],
  )
  assert.equal(runs.map((r) => r.value).join(''), text)
})

test('rumus dan Arab dalam satu teks', () => {
  const parts = parseRichText(String.raw`احسب $\sqrt{16}$ فقط`)
  assert.deepEqual(
    parts.map((p) => p.type),
    ['text', 'math', 'text'],
  )
  assert.ok(hasArabic(parts[0].value))
})

test('insertAt menyisipkan di posisi kursor', () => {
  assert.equal(insertAt('ab', 1, '$x$'), 'a$x$b')
  assert.equal(insertAt('ab', null, '!'), 'ab!')
})

test('paragraf dipisah baris kosong; baris kosong di dalam $$...$$ tidak memisah', () => {
  const blocks = parseBlocks('Paragraf satu\nbaris dua\n\n\nParagraf dua\n\n$$a\n\nb$$')
  assert.deepEqual(
    blocks.map((b) => b.text),
    ['Paragraf satu\nbaris dua', 'Paragraf dua', '$$a\n\nb$$'],
  )
})

test('tabel: judul, sub-judul, sel gabungan, dan isi', () => {
  const text = [
    'Perhatikan tabel.',
    '| Kegiatan | Kelas X | < |',
    '| | L | P |',
    '|---|---|---|',
    String.raw`| Pramuka | $\frac{1}{4}$ | 4 |`,
    'Setelah tabel.',
  ].join('\n')
  const [before, table, after] = parseBlocks(text)
  assert.equal(before.text, 'Perhatikan tabel.')
  assert.equal(after.text, 'Setelah tabel.')
  assert.equal(table.type, 'table')
  assert.deepEqual(table.head[0], [
    { text: 'Kegiatan', colSpan: 1 },
    { text: 'Kelas X', colSpan: 2 },
  ])
  assert.deepEqual(
    table.head[1].map((c) => c.text),
    ['', 'L', 'P'],
  )
  assert.deepEqual(
    table.body[0].map((c) => c.text),
    ['Pramuka', String.raw`$\frac{1}{4}$`, '4'],
  )
})

test('tabel tanpa baris pemisah: baris pertama = judul', () => {
  const [table] = parseBlocks('| A | B |\n| 1 | 2 |')
  assert.equal(table.head.length, 1)
  assert.equal(table.body.length, 1)
})

test('garis tegak di dalam rumus dan \\| tidak memisah sel', () => {
  assert.deepEqual(splitCells(String.raw`| $|x|$ | a \| b |`), ['$|x|$', 'a | b'])
})

test('*miring* dan **tebal**; bintang pada hitungan tidak berubah', () => {
  assert.deepEqual(parseEmphasis('kegiatan *extracurricular* dan **penting**'), [
    { type: 'text', value: 'kegiatan ' },
    { type: 'em', value: 'extracurricular' },
    { type: 'text', value: ' dan ' },
    { type: 'strong', value: 'penting' },
  ])
  for (const plain of ['5 * 3 * 2', 'a*b*c', 'harga * mahal']) {
    assert.deepEqual(parseEmphasis(plain), [{ type: 'text', value: plain }])
  }
  assert.deepEqual(parseEmphasis(String.raw`\*bukan miring\*`), [
    { type: 'text', value: '*bukan miring*' },
  ])
})

test('tabel berisi teks Arab berharakat tetap utuh', () => {
  const [table] = parseBlocks(`| الكلمة | Arti |\n|---|---|\n| ${ARABIC} | ke mana |`)
  assert.equal(table.body[0][0].text, ARABIC)
  assert.equal(harakat(table.body[0][0].text), harakat(ARABIC))
})
