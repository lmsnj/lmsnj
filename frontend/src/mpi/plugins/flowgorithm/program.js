/**
 * Fungsi murni program Flowgorithm (diuji di program.test.js): blok baru, bagian kosong {{}}, teks blok
 * untuk diagram, dan adaptor ke diagram flowchart yang sudah ada (utils/flowchart/layout.js).
 * Urutan bagian kosong HARUS sama dengan backend `plugins/flowgorithm/programs.py`.
 */

export const BLANK = '{{}}'
export const TYPES = ['Integer', 'Real', 'String', 'Boolean']

export const NODE_KINDS = [
  { t: 'decl', label: 'Declare', hint: 'Membuat variabel (kotak) bertipe' },
  { t: 'input', label: 'Input', hint: 'Membaca isian keyboard ke variabel' },
  { t: 'output', label: 'Output', hint: 'Menampilkan teks/hasil di Console' },
  { t: 'assign', label: 'Assign', hint: 'Mengisi variabel dengan hasil hitungan' },
  { t: 'if', label: 'If', hint: 'Percabangan True / False' },
  { t: 'while', label: 'While', hint: 'Ulangi selama syarat True (dicek di awal)' },
  { t: 'for', label: 'For', hint: 'Ulangi dengan penghitung dari .. sampai ..' },
  { t: 'do', label: 'Do While', hint: 'Kerjakan dulu, lalu cek syarat' },
  { t: 'call', label: 'Call', hint: 'Memanggil fungsi tanpa memakai hasilnya' },
  { t: 'cm', label: 'Comment', hint: 'Catatan untuk manusia (tidak dijalankan)' },
]
export const KIND_LABELS = Object.fromEntries(NODE_KINDS.map((k) => [k.t, k.label]))
export const FIELDS = {
  decl: [],
  assign: ['target', 'expr'],
  input: ['target'],
  output: ['expr'],
  if: ['cond'],
  while: ['cond'],
  for: ['v', 'from', 'to', 'step'],
  do: ['cond'],
  call: ['expr'],
  cm: ['text'],
}
export const CHILDREN = { if: ['yes', 'no'], while: ['body'], for: ['body'], do: ['body'] }

let counter = 0
export function newNodeId() {
  counter += 1
  return `n${Date.now().toString(36)}${counter.toString(36)}`
}

export function newNode(t) {
  const id = newNodeId()
  switch (t) {
    case 'decl': return { id, t, type: 'Integer', names: ['x'] }
    case 'assign': return { id, t, target: 'x', expr: '0' }
    case 'input': return { id, t, target: 'x' }
    case 'output': return { id, t, expr: '"Halo"' }
    case 'if': return { id, t, cond: 'x > 0', yes: [], no: [] }
    case 'while': return { id, t, cond: 'x < 5', body: [] }
    case 'for': return { id, t, v: 'i', from: '1', to: '5', step: '1', body: [] }
    case 'do': return { id, t, cond: 'x < 5', body: [] }
    case 'call': return { id, t, expr: 'namaFungsi()' }
    case 'cm': return { id, t, text: 'catatan' }
    default: throw new Error(`Blok tidak dikenal: ${t}`)
  } // prettier-ignore
}

export function emptyProgram() {
  return { body: [] }
}

/** Salinan program; blok tanpa id diberi id urut (untuk menandai blok yang sedang jalan/error). */
export function withIds(program) {
  let next = 0
  const walk = (nodes) =>
    (nodes ?? []).map((node) => {
      next += 1
      const copy = { ...node, id: node.id || `b${next}` }
      for (const child of CHILDREN[node.t] ?? []) copy[child] = walk(node[child])
      return copy
    })
  const result = { ...program, body: walk(program?.body) }
  if (program?.funcs) {
    result.funcs = Object.fromEntries(
      Object.entries(program.funcs).map(([name, fn]) => [name, { ...fn, body: walk(fn.body) }]),
    )
  }
  return result
}

/** [kontainer, field, kunci] untuk setiap field teks, urutan tetap (= urutan bagian kosong). */
export function fieldSlots(program) {
  const slots = []
  const walk = (nodes) => {
    for (const node of nodes ?? []) {
      for (const field of FIELDS[node.t] ?? []) slots.push([node, field, `${node.id}:${field}`])
      for (const child of CHILDREN[node.t] ?? []) walk(node[child])
    }
  }
  walk(program?.body)
  for (const [name, fn] of Object.entries(program?.funcs ?? {})) {
    walk(fn.body)
    slots.push([fn, 'ret', `fn:${name}:ret`])
  }
  return slots
}

export function countBlanks(program) {
  return fieldSlots(program).reduce(
    (sum, [container, field]) => sum + String(container[field] ?? '').split(BLANK).length - 1,
    0,
  )
}

/** Nomor bagian kosong pertama untuk tiap field ("id:field" -> indeks). Program harus sudah ber-id. */
export function blankIndexes(program) {
  const result = {}
  let index = 0
  for (const [container, field, key] of fieldSlots(program)) {
    const count = String(container[field] ?? '').split(BLANK).length - 1
    if (count) result[key] = index
    index += count
  }
  return result
}

/** Salinan program dengan setiap {{}} diganti jawaban berurutan. */
export function fillBlanks(program, answers) {
  const copy = structuredClone(program)
  const queue = [...answers]
  for (const [container, field] of fieldSlots(copy)) {
    if (!(field in container)) continue
    const pieces = String(container[field] ?? '').split(BLANK)
    let value = pieces[0]
    for (const piece of pieces.slice(1))
      value += (queue.length ? String(queue.shift()) : '') + piece
    container[field] = value
  }
  return copy
}

/** Jumlah blok yang dijalankan (komentar tidak dihitung). */
export function nodeCount(program) {
  let count = 0
  const walk = (nodes) => {
    for (const node of nodes ?? []) {
      if (node.t !== 'cm') count += 1
      for (const child of CHILDREN[node.t] ?? []) walk(node[child])
    }
  }
  walk(program?.body)
  for (const fn of Object.values(program?.funcs ?? {})) walk(fn.body)
  return count
}

/** Teks blok gaya Flowgorithm (dipakai diagram). */
export function nodeText(node) {
  switch (node.t) {
    case 'decl': {
      const names = (node.names ?? []).join(', ') || '?'
      return `${node.type} ${names}${node.size ? `[${node.size}]` : ''}`
    }
    case 'assign': return `${node.target || '?'} = ${node.expr || '?'}`
    case 'input': return `Input ${node.target || '?'}`
    case 'output': return `Output ${node.expr || '?'}`
    case 'if': return node.cond || '?'
    case 'while': return node.cond || '?'
    case 'do': return `Do sampai tidak: ${node.cond || '?'}`
    case 'for': {
      const step = node.step && node.step !== '1' ? ` langkah ${node.step}` : ''
      return `${node.v || '?'} = ${node.from || '?'} sampai ${node.to || '?'}${step}`
    }
    case 'call': return `Call ${node.expr || '?'}`
    case 'cm': return `// ${node.text ?? ''}`
    default: return '?'
  } // prettier-ignore
}

/**
 * Program Flowgorithm -> bentuk program diagram MAT-CODE-D ({ blocks }), dengan `label` = teks blok.
 * Do While digambar sebagai isi lalu belah ketupat perulangan (cukup untuk membaca alur di HP).
 */
export function toDiagram(nodes) {
  const blocks = []
  for (const node of nodes ?? []) {
    const label = nodeText(node)
    switch (node.t) {
      case 'input':
      case 'output':
        blocks.push({ id: node.id, type: node.t, label })
        break
      case 'if':
        blocks.push({
          id: node.id,
          type: 'if',
          label,
          yes: toDiagram(node.yes),
          no: toDiagram(node.no),
        })
        break
      case 'while':
        blocks.push({ id: node.id, type: 'while', label, body: toDiagram(node.body) })
        break
      case 'do':
        blocks.push({ id: node.id, type: 'while', label, body: toDiagram(node.body) })
        break
      case 'for':
        blocks.push({ id: node.id, type: 'for', label, body: toDiagram(node.body) })
        break
      default:
        blocks.push({ id: node.id, type: 'assign', label })
    }
  }
  return blocks
}

/** Teks "a: Integer, b: Real" <-> [[a, Integer], [b, Real]] untuk parameter fungsi di Studio. */
export function parseParams(text) {
  return String(text ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, type] = part.split(':').map((s) => s.trim())
      return [name, TYPES.find((t) => t.toLowerCase() === (type ?? '').toLowerCase()) ?? 'Integer']
    })
}

export function paramsText(params) {
  return (params ?? []).map(([name, type]) => `${name}: ${type}`).join(', ')
}

/** Jawaban siap diperiksa: susun = ada blok selain komentar; isi = semua bagian kosong terisi. */
export function isAnswered(step, value) {
  if (!value) return false
  if (step.mode === 'fill') return (value.blanks ?? []).every((b) => String(b).trim())
  return (value.program?.body ?? []).some((node) => node.t !== 'cm')
}
