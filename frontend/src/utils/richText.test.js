import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasArabic, insertAt, parseRichText, splitArabic } from './richText.js'

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
