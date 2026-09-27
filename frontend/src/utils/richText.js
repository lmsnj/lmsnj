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
