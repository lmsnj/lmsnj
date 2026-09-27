// Pembaca "teks kaya" untuk soal: rumus LaTeX ($...$ dan $$...$$) + potongan teks Arab.
// Fungsi murni (tanpa React) agar mudah diuji.

const range = (from, to) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`
// Blok Unicode Arab (huruf, harakat, angka Arab, bentuk presentasi).
const ARABIC_CHARS = range(0x0600, 0x06ff) + range(0x0750, 0x077f) + range(0x08a0, 0x08ff)
  + range(0xfb50, 0xfdff) + range(0xfe70, 0xfefc) // prettier-ignore
// Satu potongan Arab: huruf Arab, boleh diselingi spasi/tanda baca di antaranya.
const ARABIC_RUN = new RegExp(
  `[${ARABIC_CHARS}]+(?:[\\s.,!?;:()«»"'\\-]+[${ARABIC_CHARS}]+)*[؟!.،]?`,
  'g',
)
const HAS_ARABIC = new RegExp(`[${ARABIC_CHARS}]`)

export const hasArabic = (text) => HAS_ARABIC.test(text ?? '')

// Posisi penutup `delim` (bukan \$) mulai dari `from`; -1 jika tidak ada.
function findClosing(text, from, delim) {
  let index = text.indexOf(delim, from)
  while (index !== -1 && text[index - 1] === '\\') index = text.indexOf(delim, index + 1)
  return index
}

/**
 * Pecah teks menjadi potongan: {type:'text', value} dan {type:'math', value, display}.
 * - $$...$$ = rumus di baris sendiri; $...$ = rumus dalam kalimat.
 * - \$ = tanda dolar biasa.
 * - "$5 dan $10" TIDAK dianggap rumus: isi rumus dalam kalimat tidak boleh diawali/diakhiri spasi.
 */
export function parseRichText(input) {
  const text = String(input ?? '')
  const parts = []
  let buffer = ''
  const flush = () => {
    if (buffer) parts.push({ type: 'text', value: buffer })
    buffer = ''
  }

  for (let i = 0; i < text.length;) {
    if (text[i] === '\\' && text[i + 1] === '$') {
      buffer += '$'
      i += 2
      continue
    }
    if (text[i] === '$') {
      const display = text[i + 1] === '$'
      const delim = display ? '$$' : '$'
      const start = i + delim.length
      const end = findClosing(text, start, delim)
      const body = end === -1 ? '' : text.slice(start, end)
      const valid = body.trim() && (display || (!/^\s/.test(body) && !/\s$/.test(body)))
      if (valid) {
        flush()
        parts.push({ type: 'math', value: body.trim(), display })
        i = end + delim.length
        continue
      }
    }
    buffer += text[i]
    i += 1
  }
  flush()
  return parts
}

/** Pecah teks biasa menjadi potongan Arab dan non-Arab: [{arabic: bool, value}]. */
export function splitArabic(text) {
  const runs = []
  let last = 0
  for (const match of String(text ?? '').matchAll(ARABIC_RUN)) {
    if (match.index > last) runs.push({ arabic: false, value: text.slice(last, match.index) })
    runs.push({ arabic: true, value: match[0] })
    last = match.index + match[0].length
  }
  if (last < String(text ?? '').length) runs.push({ arabic: false, value: text.slice(last) })
  return runs
}

// Sisipkan `snippet` ke `value` pada posisi kursor (dipakai tombol "Sisipkan Rumus").
export function insertAt(value, position, snippet) {
  const at = position ?? value.length
  return value.slice(0, at) + snippet + value.slice(at)
}

/**
 * Pecah teks menjadi blok: {type:'paragraph', text} (dipisah baris kosong) dan {type:'table', ...}.
 * Tabel = baris-baris yang diawali "|":
 *   | Kegiatan | Kelas X | < |        <- baris judul (warna merah marun)
 *   |          | L       | P |        <- baris judul kedua sebelum |---| = sub-judul (merah muda)
 *   |---|---|---|                     <- pemisah judul dan isi
 *   | Pramuka  | 6       | 4 |
 * Sel berisi "<" saja digabung dengan sel di kirinya (colspan). "\|" = garis tegak biasa.
 */
export function parseBlocks(input) {
  const lines = String(input ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
  const blocks = []
  let paragraph = []
  let table = null
  let inDisplayMath = false
  const flushParagraph = () => {
    if (paragraph.some((line) => line.trim())) {
      blocks.push({ type: 'paragraph', text: paragraph.join('\n').trim() })
    }
    paragraph = []
  }
  const flushTable = () => {
    if (table) blocks.push(buildTable(table))
    table = null
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!inDisplayMath && trimmed.startsWith('|')) {
      flushParagraph()
      ;(table ??= []).push(trimmed)
      continue
    }
    flushTable()
    // Baris kosong di dalam rumus $$...$$ tidak memisah paragraf.
    if (!trimmed && !inDisplayMath) {
      flushParagraph()
      continue
    }
    paragraph.push(line)
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) inDisplayMath = !inDisplayMath
  }
  flushTable()
  flushParagraph()
  return blocks
}

const BACKSLASH = String.fromCharCode(92)

// Pecah satu baris tabel menjadi teks sel. "|" di dalam rumus $...$ tidak dianggap pemisah.
export function splitCells(line) {
  let body = line.trim()
  if (body.startsWith('|')) body = body.slice(1)
  if (body.endsWith('|') && !body.endsWith(`${BACKSLASH}|`)) body = body.slice(0, -1)
  const cells = []
  let cell = ''
  let inMath = false
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i]
    if (char === BACKSLASH && body[i + 1] === '|' && !inMath) {
      cell += '|'
      i += 1
      continue
    }
    if (char === BACKSLASH && body[i + 1] === '$') {
      cell += `${BACKSLASH}$` // tetap "\$" agar dibaca sebagai dolar biasa oleh parseRichText
      i += 1
      continue
    }
    if (char === '$') inMath = !inMath
    if (char === '|' && !inMath) {
      cells.push(cell.trim())
      cell = ''
      continue
    }
    cell += char
  }
  cells.push(cell.trim())
  return cells
}

const isSeparator = (cells) => cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c))

// Sel "<" digabung ke sel sebelah kirinya.
function mergeCells(cells) {
  const merged = []
  for (const text of cells) {
    if (text === '<' && merged.length) merged.at(-1).colSpan += 1
    else merged.push({ text, colSpan: 1 })
  }
  return merged
}

function buildTable(lines) {
  const rows = lines.map(splitCells)
  const separator = rows.findIndex(isSeparator)
  // Tanpa baris pemisah: baris pertama dianggap judul.
  const head = separator === -1 ? rows.slice(0, 1) : rows.slice(0, separator)
  const body =
    separator === -1 ? rows.slice(1) : rows.slice(separator + 1).filter((r) => !isSeparator(r))
  return { type: 'table', head: head.map(mergeCells), body: body.map(mergeCells) }
}

// *miring* dan **tebal**. Bintang harus menempel pada teks ("5 * 3 * 2" dan "a*b*c" tidak berubah).
const EMPHASIS =
  /(?<![\\\w*])\*\*(?=\S)([^\n]+?)(?<=\S)\*\*(?![\w*])|(?<![\\\w*])\*(?=[^\s*])([^*\n]+?)(?<=\S)\*(?![\w*])/g

/** Pecah teks biasa menjadi [{type:'text'|'em'|'strong', value}]. "\*" = bintang biasa. */
export function parseEmphasis(text) {
  const value = String(text ?? '')
  const parts = []
  let last = 0
  const push = (type, raw) => raw && parts.push({ type, value: raw.replace(/\\\*/g, '*') })
  for (const match of value.matchAll(EMPHASIS)) {
    push('text', value.slice(last, match.index))
    if (match[1] !== undefined) push('strong', match[1])
    else push('em', match[2])
    last = match.index + match[0].length
  }
  push('text', value.slice(last))
  return parts
}
