/**
 * Program flowchart (fungsi murni, diuji di program.test.js). Disimpan sebagai teks JSON di
 * CodeAttempt.code / CodeExercise.starter_code:
 *   { "version": 1, "blocks": [ blok, ... ] }
 * Jenis blok:
 *   input  { variable }                       Masukan: baca satu baris Masukan ke variabel
 *   output { expression }                     Keluaran: tampilkan nilai (satu baris)
 *   assign { variable, expression }           Proses: variabel ← nilai
 *   if     { condition, yes: [...], no: [...] }
 *   while  { condition, body: [...] }         Ulangi selama kondisi benar (diperiksa di awal)
 *   for    { variable, from, to, step, body } Ulangi variabel dari..sampai (termasuk batas akhir)
 * Setiap blok punya `id` (untuk menandai blok yang error dan mengedit di editor).
 */
import { evaluate, FlowError, formatValue, parseExpression } from './expression.js'

export const BLOCK_TYPES = [
  { type: 'input', label: 'Masukan', hint: 'Membaca satu baris masukan ke variabel' },
  { type: 'output', label: 'Keluaran', hint: 'Menampilkan nilai/teks' },
  { type: 'assign', label: 'Proses', hint: 'Mengisi variabel dengan hasil hitungan' },
  { type: 'if', label: 'Jika', hint: 'Percabangan Ya / Tidak' },
  { type: 'while', label: 'Selama', hint: 'Ulangi selama kondisi benar' },
  { type: 'for', label: 'Ulangi untuk', hint: 'Ulangi dengan penghitung, mis. i dari 1 sampai 10' },
]
export const BLOCK_LABELS = Object.fromEntries(BLOCK_TYPES.map((t) => [t.type, t.label]))
// Daftar anak per jenis blok (nama properti).
export const BRANCHES = { if: ['yes', 'no'], while: ['body'], for: ['body'] }

const MAX_STEPS = 100_000
const MAX_OUTPUT = 100_000
const MAX_BLOCKS = 300
const NAME = /^[a-z_][a-z0-9_]*$/
const RESERVED = new Set([
  'atau', 'or', 'dan', 'and', 'tidak', 'not', 'div', 'mod', 'benar', 'true', 'salah', 'false',
]) // prettier-ignore

let counter = 0
export function newId() {
  counter += 1
  return `b${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function newBlock(type) {
  const id = newId()
  switch (type) {
    case 'input': return { id, type, variable: '' }
    case 'output': return { id, type, expression: '' }
    case 'assign': return { id, type, variable: '', expression: '' }
    case 'if': return { id, type, condition: '', yes: [], no: [] }
    case 'while': return { id, type, condition: '', body: [] }
    case 'for': return { id, type, variable: 'i', from: '1', to: '', step: '1', body: [] }
    default: throw new Error(`Jenis blok tidak dikenal: ${type}`)
  } // prettier-ignore
}

export function emptyProgram() {
  return { version: 1, blocks: [] }
}

/** Teks JSON -> program. Teks kosong/rusak -> program kosong (agar editor tetap bisa dipakai). */
export function parseProgram(text) {
  if (!text) return emptyProgram()
  try {
    const data = JSON.parse(text)
    if (data && Array.isArray(data.blocks)) return { version: 1, blocks: data.blocks }
  } catch {
    // diabaikan: dianggap kosong
  }
  return emptyProgram()
}

export function serializeProgram(program) {
  return JSON.stringify({ version: 1, blocks: program.blocks })
}

// ---------------------------------------------------------------- operasi pohon (tanpa mengubah aslinya)

function mapLists(blocks, fn) {
  return fn(blocks).map((block) => {
    const branches = BRANCHES[block.type]
    if (!branches) return block
    const copy = { ...block }
    for (const key of branches) copy[key] = mapLists(block[key] ?? [], fn)
    return copy
  })
}

export function updateBlock(blocks, id, changes) {
  return mapLists(blocks, (list) => list.map((b) => (b.id === id ? { ...b, ...changes } : b)))
}

export function removeBlock(blocks, id) {
  return mapLists(blocks, (list) => list.filter((b) => b.id !== id))
}

/** Pindah blok satu langkah ke atas (-1) / bawah (+1) di daftarnya sendiri. */
export function moveBlock(blocks, id, delta) {
  return mapLists(blocks, (list) => {
    const index = list.findIndex((b) => b.id === id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= list.length) return list
    const copy = [...list]
    ;[copy[index], copy[target]] = [copy[target], copy[index]]
    return copy
  })
}

/**
 * Sisipkan `block` ke daftar: parentId null = daftar utama; selain itu daftar `branch` (yes/no/body)
 * milik blok parentId. `index` = posisi (akhir jika lebih besar dari panjang daftar).
 */
export function insertBlock(blocks, parentId, branch, index, block) {
  const insertInto = (list) => {
    const copy = [...list]
    copy.splice(Math.min(index, copy.length), 0, block)
    return copy
  }
  if (parentId === null) return insertInto(blocks)
  return mapLists(blocks, (list) =>
    list.map((b) => (b.id === parentId ? { ...b, [branch]: insertInto(b[branch] ?? []) } : b)),
  )
}

export function countBlocks(blocks) {
  return blocks.reduce(
    (total, block) =>
      total +
      1 +
      (BRANCHES[block.type] ?? []).reduce((n, key) => n + countBlocks(block[key] ?? []), 0),
    0,
  )
}

/** Teks singkat blok untuk diagram. */
export function blockText(block) {
  // Diagram dari dialek lain (mis. plugin Flowgorithm MPI) membawa teksnya sendiri.
  if (block.label) return block.label
  switch (block.type) {
    case 'input': return `Masukan ${block.variable || '?'}`
    case 'output': return `Keluaran ${block.expression || '?'}`
    case 'assign': return `${block.variable || '?'} ← ${block.expression || '?'}`
    case 'if': return `${block.condition || '?'} ?`
    case 'while': return `${block.condition || '?'} ?`
    case 'for': {
      const step = block.step && block.step !== '1' ? ` langkah ${block.step}` : ''
      return `${block.variable || '?'} ← ${block.from || '?'} sampai ${block.to || '?'}${step}`
    }
    default: return '?'
  } // prettier-ignore
}

// ---------------------------------------------------------------- validasi & menjalankan

function checkName(name, block, label = 'Nama variabel') {
  const value = String(name ?? '')
    .trim()
    .toLowerCase()
  if (!value) throw new FlowError(`${label} masih kosong.`, block.id)
  if (!NAME.test(value) || RESERVED.has(value)) {
    throw new FlowError(
      `${label} “${name}” tidak boleh dipakai (pakai huruf, angka, garis bawah).`,
      block.id,
    )
  }
  return value
}

/** Ubah satu blok menjadi bentuk siap jalan (ekspresi sudah dibaca). Melempar FlowError + id blok. */
function compileBlock(block) {
  const expr = (text, label) => {
    if (!String(text ?? '').trim()) throw new FlowError(`${label} masih kosong.`, block.id)
    try {
      return parseExpression(text)
    } catch (error) {
      throw new FlowError(`${label}: ${error.message}`, block.id)
    }
  }
  const compiled = { id: block.id, type: block.type }
  switch (block.type) {
    case 'input':
      compiled.variable = checkName(block.variable, block)
      break
    case 'output':
      compiled.expression = expr(block.expression, 'Keluaran')
      break
    case 'assign':
      compiled.variable = checkName(block.variable, block)
      compiled.expression = expr(block.expression, 'Nilai')
      break
    case 'if':
      compiled.condition = expr(block.condition, 'Kondisi')
      compiled.yes = compileList(block.yes ?? [])
      compiled.no = compileList(block.no ?? [])
      break
    case 'while':
      compiled.condition = expr(block.condition, 'Kondisi')
      compiled.body = compileList(block.body ?? [])
      break
    case 'for':
      compiled.variable = checkName(block.variable, block, 'Variabel penghitung')
      compiled.from = expr(block.from, 'Nilai awal')
      compiled.to = expr(block.to, 'Nilai akhir')
      compiled.step = String(block.step ?? '').trim() ? expr(block.step, 'Langkah') : null
      compiled.body = compileList(block.body ?? [])
      break
    default:
      throw new FlowError('Jenis blok tidak dikenal.', block.id)
  }
  return compiled
}

function compileList(blocks) {
  return blocks.map(compileBlock)
}

/** Masalah pertama di program ({ message, blockId }) atau null jika siap dijalankan. */
export function findProblem(program) {
  if (!program.blocks.length)
    return { message: 'Flowchart masih kosong. Tambahkan blok.', blockId: null }
  if (countBlocks(program.blocks) > MAX_BLOCKS) {
    return { message: `Flowchart terlalu besar (maks. ${MAX_BLOCKS} blok).`, blockId: null }
  }
  try {
    compileList(program.blocks)
    return null
  } catch (error) {
    return { message: error.message, blockId: error.blockId ?? null }
  }
}

function readValue(line) {
  const text = line.trim()
  // Angka dikenali otomatis (koma desimal juga), selain itu teks.
  if (/^-?\d+([.,]\d+)?$/.test(text)) return Number(text.replace(',', '.'))
  return text
}

/**
 * Jalankan program dengan `input` (baris-baris Masukan). Mengembalikan { output, error, blockId }:
 * error = pesan berbahasa Indonesia (null jika berhasil), blockId = blok tempat error terjadi.
 */
export function runProgram(program, input = '') {
  let output = ''
  const lines = String(input ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  let nextLine = 0
  let steps = 0
  const vars = new Map()

  const tick = (block) => {
    steps += 1
    if (steps > MAX_STEPS) {
      throw new FlowError(
        'Program berjalan terlalu lama lalu dihentikan. Periksa perulangan yang tidak pernah berhenti.',
        block.id,
      )
    }
  }
  const value = (node, block) => {
    try {
      return evaluate(node, vars)
    } catch (error) {
      throw new FlowError(error.message, block.id)
    }
  }
  const condition = (node, block) => {
    const result = value(node, block)
    if (typeof result !== 'boolean') {
      throw new FlowError('Kondisi harus bernilai benar/salah, mis. nilai >= 75.', block.id)
    }
    return result
  }
  const numberOf = (node, block, label) => {
    const result = value(node, block)
    if (typeof result !== 'number') throw new FlowError(`${label} harus angka.`, block.id)
    return result
  }

  const run = (list) => {
    for (const block of list) {
      tick(block)
      switch (block.type) {
        case 'input':
          if (nextLine >= lines.length) {
            throw new FlowError(
              'Masukan habis: blok Masukan lebih banyak dari baris Masukan.',
              block.id,
            )
          }
          vars.set(block.variable, readValue(lines[nextLine++]))
          break
        case 'output': {
          let text
          try {
            text = formatValue(value(block.expression, block))
          } catch (error) {
            throw new FlowError(error.message, block.id)
          }
          output += `${text}\n`
          if (output.length > MAX_OUTPUT) {
            throw new FlowError('Keluaran terlalu panjang. Periksa perulanganmu.', block.id)
          }
          break
        }
        case 'assign':
          vars.set(block.variable, value(block.expression, block))
          break
        case 'if':
          run(condition(block.condition, block) ? block.yes : block.no)
          break
        case 'while':
          while (condition(block.condition, block)) {
            run(block.body)
            tick(block)
          }
          break
        case 'for': {
          const start = numberOf(block.from, block, 'Nilai awal')
          const end = numberOf(block.to, block, 'Nilai akhir')
          const step = block.step ? numberOf(block.step, block, 'Langkah') : start <= end ? 1 : -1
          if (step === 0) throw new FlowError('Langkah tidak boleh 0.', block.id)
          for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
            vars.set(block.variable, i)
            run(block.body)
            tick(block)
          }
          break
        }
        default:
          break
      }
    }
  }

  try {
    const problem = findProblem(program)
    if (problem) return { output, error: problem.message, blockId: problem.blockId }
    run(compileList(program.blocks))
    return { output, error: null, blockId: null }
  } catch (error) {
    if (!(error instanceof FlowError)) throw error
    return { output, error: error.message, blockId: error.blockId }
  }
}
