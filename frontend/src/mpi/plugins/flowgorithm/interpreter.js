/**
 * Interpreter dialek Flowgorithm untuk Media Pembelajaran Interaktif (fungsi murni, tanpa eval).
 *
 * KEMBARAN dari backend/apps/learning_media/plugins/flowgorithm/interpreter.py: aturan, batas, dan pesan
 * kesalahannya harus sama persis karena siswa mencoba di browser, sedangkan nilai dihitung di server.
 * Keduanya diuji dengan berkas kasus yang sama (conformance.json di folder plugin backend).
 *
 * Program = { body: [blok], funcs: { nama: { params: [[nama, tipe]], type, body, ret } } }
 * Blok: decl {type, names, size} | assign {target, expr} | input {target} | output {expr}
 *       if {cond, yes, no} | while {cond, body} | for {v, from, to, step, body} | do {body, cond}
 *       call {expr} | cm {text}
 * Tipe: Integer, Real, String, Boolean. Nama variabel tidak membedakan huruf besar/kecil.
 */

export const LIMITS = {
  steps: 20000, // langkah maksimal (mencegah perulangan tak berhenti)
  output: 500, // baris output maksimal
  text: 10000, // panjang teks maksimal
  array: 1000, // jumlah laci array maksimal
  depth: 50, // kedalaman pemanggilan fungsi
}
export const TYPES = ['Integer', 'Real', 'String', 'Boolean']
const RESERVED = ['integer', 'real', 'string', 'boolean', 'and', 'or', 'not', 'mod', 'true', 'false', 'pi'] // prettier-ignore
const NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/
const TARGET_RE = /^\s*([A-Za-z][A-Za-z0-9]*)\s*(?:\[(.+)\])?\s*$/

export class FlowError extends Error {}

// ---------------------------------------------------------------- ekspresi

export function tokenize(src) {
  const tokens = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i += 1
      continue
    }
    if (c === '"') {
      const j = src.indexOf('"', i + 1)
      if (j < 0) throw new FlowError('Tanda kutip ganda belum ditutup.')
      tokens.push({ k: 'str', v: src.slice(i + 1, j) })
      i = j + 1
      continue
    }
    const rest = src.slice(i)
    let m = /^\d+(\.\d+)?/.exec(rest)
    if (m) {
      tokens.push({ k: 'num', v: parseFloat(m[0]) })
      i += m[0].length
      continue
    }
    m = /^[A-Za-z][A-Za-z0-9]*/.exec(rest)
    if (m) {
      const word = m[0]
      const lower = word.toLowerCase()
      if (['and', 'or', 'not', 'mod'].includes(lower)) tokens.push({ k: 'op', v: lower })
      else if (lower === 'true' || lower === 'false')
        tokens.push({ k: 'bool', v: lower === 'true' })
      else if (lower === 'pi') tokens.push({ k: 'num', v: Math.PI })
      else tokens.push({ k: 'id', v: word })
      i += word.length
      continue
    }
    const two = src.substr(i, 2)
    if (['==', '!=', '<=', '>='].includes(two)) {
      tokens.push({ k: 'op', v: two })
      i += 2
      continue
    }
    if ('+-*/%^&<>()[],'.includes(c)) {
      tokens.push({ k: 'op', v: c })
      i += 1
      continue
    }
    if (c === '=') throw new FlowError('Untuk membandingkan, pakai == (dua sama dengan).')
    if (c === '_') throw new FlowError('Garis bawah (_) tidak boleh dipakai di Flowgorithm.')
    throw new FlowError(`Ada karakter yang tidak dikenal: ${c}`)
  }
  return tokens
}

const COMPARE = ['==', '!=', '<', '>', '<=', '>=']

export function parseExpr(src) {
  const tokens = tokenize(String(src ?? ''))
  let p = 0
  if (!tokens.length) throw new FlowError('Isian masih kosong.')
  const peek = () => tokens[p]
  const isOp = (v) => tokens[p]?.k === 'op' && tokens[p].v === v
  const take = (v) => {
    if (!isOp(v)) throw new FlowError(`Seharusnya ada "${v}" di sini.`)
    p += 1
  }
  const orE = () => {
    let l = andE()
    while (isOp('or')) {
      p += 1
      l = { n: 'bin', o: 'or', l, r: andE() }
    }
    return l
  }
  const andE = () => {
    let l = notE()
    while (isOp('and')) {
      p += 1
      l = { n: 'bin', o: 'and', l, r: notE() }
    }
    return l
  }
  const notE = () => {
    if (isOp('not')) {
      p += 1
      return { n: 'un', o: 'not', e: notE() }
    }
    return cmpE()
  }
  const cmpE = () => {
    let l = catE()
    while (peek()?.k === 'op' && COMPARE.includes(peek().v)) {
      const o = tokens[p].v
      p += 1
      l = { n: 'bin', o, l, r: catE() }
    }
    return l
  }
  const catE = () => {
    let l = addE()
    while (isOp('&')) {
      p += 1
      l = { n: 'bin', o: '&', l, r: addE() }
    }
    return l
  }
  const addE = () => {
    let l = mulE()
    while (isOp('+') || isOp('-')) {
      const o = tokens[p].v
      p += 1
      l = { n: 'bin', o, l, r: mulE() }
    }
    return l
  }
  const mulE = () => {
    let l = unE()
    while (isOp('*') || isOp('/') || isOp('%') || isOp('mod')) {
      const o = tokens[p].v
      p += 1
      l = { n: 'bin', o: o === 'mod' ? '%' : o, l, r: unE() }
    }
    return l
  }
  const unE = () => {
    if (isOp('-')) {
      p += 1
      return { n: 'un', o: '-', e: unE() }
    }
    return powE()
  }
  const powE = () => {
    const l = post()
    if (isOp('^')) {
      p += 1
      return { n: 'bin', o: '^', l, r: unE() }
    }
    return l
  }
  const post = () => {
    const x = peek()
    if (!x) throw new FlowError('Ekspresi belum lengkap.')
    p += 1
    if (x.k === 'num' || x.k === 'str' || x.k === 'bool') return { n: 'lit', v: x.v }
    if (x.k === 'op' && x.v === '(') {
      const e = orE()
      take(')')
      return e
    }
    if (x.k === 'id') {
      if (isOp('(')) {
        p += 1
        const args = []
        if (!isOp(')')) {
          args.push(orE())
          while (isOp(',')) {
            p += 1
            args.push(orE())
          }
        }
        take(')')
        return { n: 'call', name: x.v, a: args }
      }
      if (isOp('[')) {
        p += 1
        const index = orE()
        take(']')
        return { n: 'idx', name: x.v, i: index }
      }
      return { n: 'var', name: x.v }
    }
    throw new FlowError(`Ekspresi tidak bisa dibaca di dekat "${x.v === undefined ? '' : x.v}".`)
  }
  const result = orE()
  if (p < tokens.length)
    throw new FlowError(`Ada bagian ekspresi yang tidak dipahami: "${tokens[p].v}".`)
  return result
}

/** Angka ditampilkan maks. 12 digit penting (0.1 + 0.2 tampil 0.3), seperti Flowgorithm. */
export function formatValue(value) {
  if (typeof value === 'number') return String(parseFloat(value.toPrecision(12)))
  return String(value)
}

const isNumber = (v) => typeof v === 'number'

function checkText(text) {
  if (text.length > LIMITS.text)
    throw new FlowError(`Teks terlalu panjang (maks. ${LIMITS.text} karakter).`)
  return text
}

function lookup(scope, name) {
  const variable = scope.vars[name.toLowerCase()]
  if (!variable) throw new FlowError(`Variabel "${name}" belum dibuat. Buat dulu dengan Declare.`)
  return variable
}

function arrayIndex(variable, name, raw) {
  if (typeof raw !== 'number' || raw !== Math.floor(raw))
    throw new FlowError('Nomor laci harus bilangan bulat.')
  if (raw < 0 || raw >= variable.val.length)
    throw new FlowError(
      `Laci nomor ${formatValue(raw)} tidak ada. Indeks ${name} hanya 0 sampai ${variable.val.length - 1}.`,
    )
  return raw
}

// Fungsi bawaan Flowgorithm yang hasilnya pasti (tanpa Random agar penilaian selalu sama).
const BUILTINS = {
  abs: [1, (x) => (num(x, 'Abs'), Math.abs(x))],
  int: [1, (x) => (num(x, 'Int'), Math.trunc(x))],
  sqrt: [
    1,
    (x) => {
      num(x, 'Sqrt')
      if (x < 0) throw new FlowError('Akar dari bilangan negatif tidak bisa dihitung.')
      return Math.sqrt(x)
    },
  ],
  len: [
    1,
    (x) => {
      if (typeof x !== 'string') throw new FlowError('Len hanya untuk teks.')
      return x.length
    },
  ],
  tostring: [1, (x) => checkText(formatValue(x))],
  tointeger: [
    1,
    (x) => {
      const text = String(typeof x === 'number' ? formatValue(x) : x).trim()
      if (!/^-?\d+$/.test(text)) throw new FlowError(`"${text}" tidak bisa diubah menjadi Integer.`)
      return parseInt(text, 10)
    },
  ],
  toreal: [
    1,
    (x) => {
      const text = String(typeof x === 'number' ? formatValue(x) : x).trim()
      if (!/^-?\d+(\.\d+)?$/.test(text))
        throw new FlowError(`"${text}" tidak bisa diubah menjadi Real.`)
      return parseFloat(text)
    },
  ],
}
function num(x, name) {
  if (!isNumber(x)) throw new FlowError(`${name} hanya untuk angka.`)
}

export function coerce(type, value, name) {
  if (type === 'Integer') {
    if (!isNumber(value))
      throw new FlowError(`Variabel ${name} bertipe Integer, hanya bisa diisi bilangan.`)
    return Math.trunc(value)
  }
  if (type === 'Real') {
    if (!isNumber(value))
      throw new FlowError(`Variabel ${name} bertipe Real, hanya bisa diisi bilangan.`)
    return value
  }
  if (type === 'String') {
    if (typeof value !== 'string')
      throw new FlowError(
        `Variabel ${name} bertipe String, hanya bisa diisi teks (pakai tanda kutip).`,
      )
    return value
  }
  if (typeof value !== 'boolean')
    throw new FlowError(`Variabel ${name} bertipe Boolean, hanya bisa diisi true atau false.`)
  return value
}

export function defaultValue(type) {
  if (type === 'Integer' || type === 'Real') return 0
  return type === 'String' ? '' : false
}

/** Isian keyboard -> nilai bertipe. */
export function typedInput(type, raw, name) {
  const text = String(raw ?? '').trim()
  if (type === 'Integer') {
    if (!/^-?\d+$/.test(text)) throw new FlowError(`Isian untuk ${name} harus bilangan bulat.`)
    return parseInt(text, 10)
  }
  if (type === 'Real') {
    if (!/^-?\d+(\.\d+)?$/.test(text)) throw new FlowError(`Isian untuk ${name} harus bilangan.`)
    return parseFloat(text)
  }
  if (type === 'Boolean') {
    const lower = text.toLowerCase()
    if (lower !== 'true' && lower !== 'false')
      throw new FlowError(`Isian untuk ${name} harus true atau false.`)
    return lower === 'true'
  }
  return checkText(text)
}

// ---------------------------------------------------------------- menjalankan

function parsed(run, src) {
  const key = String(src ?? '')
  let ast = run.cache.get(key)
  if (!ast) {
    ast = parseExpr(key)
    run.cache.set(key, ast)
  }
  return ast
}

function evaluate(ast, scope, run) {
  switch (ast.n) {
    case 'lit':
      return ast.v
    case 'var': {
      const variable = lookup(scope, ast.name)
      if (variable.arr)
        throw new FlowError(
          `"${ast.name}" adalah array. Tulis nomor lacinya, contoh ${ast.name}[0].`,
        )
      return variable.val
    }
    case 'idx': {
      const variable = lookup(scope, ast.name)
      if (!variable.arr) throw new FlowError(`"${ast.name}" bukan array.`)
      return variable.val[arrayIndex(variable, ast.name, evaluate(ast.i, scope, run))]
    }
    case 'call': {
      const value = callFunction(ast, scope, run)
      if (value === undefined) throw new FlowError(`Fungsi ${ast.name} tidak mengembalikan nilai.`)
      return value
    }
    case 'un': {
      const value = evaluate(ast.e, scope, run)
      if (ast.o === 'not') {
        if (typeof value !== 'boolean')
          throw new FlowError('not hanya untuk nilai true atau false.')
        return !value
      }
      if (!isNumber(value)) throw new FlowError('Tanda minus hanya untuk angka.')
      return -value
    }
    case 'bin':
      return binary(ast, scope, run)
    default:
      throw new FlowError('Ekspresi tidak bisa dihitung.')
  }
}

function binary(ast, scope, run) {
  const o = ast.o
  if (o === 'and' || o === 'or') {
    const left = evaluate(ast.l, scope, run)
    if (typeof left !== 'boolean') throw new FlowError(`${o} hanya untuk nilai true atau false.`)
    if (o === 'and' && !left) return false
    if (o === 'or' && left) return true
    const right = evaluate(ast.r, scope, run)
    if (typeof right !== 'boolean') throw new FlowError(`${o} hanya untuk nilai true atau false.`)
    return right
  }
  const L = evaluate(ast.l, scope, run)
  const R = evaluate(ast.r, scope, run)
  if (o === '&') return checkText(formatValue(L) + formatValue(R))
  if (COMPARE.includes(o)) {
    if (typeof L !== typeof R) throw new FlowError('Tidak bisa membandingkan angka dengan teks.')
    if (o === '==') return L === R
    if (o === '!=') return L !== R
    if (o === '<') return L < R
    if (o === '>') return L > R
    if (o === '<=') return L <= R
    return L >= R
  }
  if (!isNumber(L) || !isNumber(R))
    throw new FlowError(`Operator ${o} hanya untuk angka. Untuk menggabungkan teks pakai &.`)
  if (o === '+') return L + R
  if (o === '-') return L - R
  if (o === '*') return L * R
  if (o === '/' || o === '%') {
    if (R === 0) throw new FlowError('Tidak bisa dibagi nol.')
    return o === '/' ? L / R : L % R
  }
  return Math.pow(L, R)
}

/** Panggil fungsi buatan siswa atau fungsi bawaan. Fungsi tanpa return -> undefined. */
function callFunction(ast, scope, run) {
  const lower = ast.name.toLowerCase()
  const fn = run.funcs[lower]
  if (!fn) {
    const builtin = BUILTINS[lower]
    if (!builtin) throw new FlowError(`Fungsi "${ast.name}" tidak ditemukan.`)
    if (ast.a.length !== builtin[0])
      throw new FlowError(`Fungsi ${ast.name} butuh ${builtin[0]} argumen.`)
    return builtin[1](...ast.a.map((arg) => evaluate(arg, scope, run)))
  }
  const params = fn.params ?? []
  const args = ast.a.map((arg) => evaluate(arg, scope, run))
  if (args.length !== params.length)
    throw new FlowError(`Fungsi ${ast.name} butuh ${params.length} argumen.`)
  if (run.depth >= LIMITS.depth)
    throw new FlowError('Fungsi memanggil dirinya terlalu dalam (rekursi tak berhenti).')
  const local = { vars: {} }
  params.forEach(([name, type], i) => {
    local.vars[name.toLowerCase()] = { type, val: coerce(type, args[i], name), name }
  })
  // Kedalaman dihitung sampai nilai return selesai dihitung (return boleh memanggil fungsi lagi).
  run.depth += 1
  try {
    const inner = execList(fn.body ?? [], local, run, true)
    while (!inner.next().done) {
      /* fungsi dijalankan sekaligus (tanpa jeda per langkah) */
    }
    if (!String(fn.ret ?? '').trim()) return undefined
    const value = evaluate(parsed(run, fn.ret), local, run)
    return fn.type && TYPES.includes(fn.type) ? coerce(fn.type, value, ast.name) : value
  } finally {
    run.depth -= 1
  }
}

function assignTarget(target, value, scope, run) {
  const m = TARGET_RE.exec(String(target ?? ''))
  if (!m) throw new FlowError('Bagian kiri tanda = harus nama variabel.')
  const variable = lookup(scope, m[1])
  if (m[2] !== undefined) {
    if (!variable.arr) throw new FlowError(`"${m[1]}" bukan array.`)
    const index = arrayIndex(variable, m[1], evaluate(parsed(run, m[2]), scope, run))
    variable.val[index] = coerce(variable.type, value, m[1])
  } else {
    if (variable.arr)
      throw new FlowError(`"${m[1]}" adalah array. Tulis nomor lacinya, contoh ${m[1]}[0].`)
    variable.val = coerce(variable.type, value, m[1])
  }
}

function tick(run) {
  if (run.count > LIMITS.steps)
    throw new FlowError(
      'Program tidak berhenti sendiri (loop tak berhenti). Cek perubahan nilai di dalam perulangan.',
    )
  run.count += 1
}

function emit(run, text) {
  if (run.out.length >= LIMITS.output)
    throw new FlowError(`Output terlalu banyak (maks. ${LIMITS.output} baris).`)
  run.out.push(text)
}

function condition(run, src, scope, label) {
  const value = evaluate(parsed(run, src), scope, run)
  if (typeof value !== 'boolean')
    throw new FlowError(`Syarat ${label} harus bernilai true atau false.`)
  return value
}

/** Generator: yield {ev: 'step', node} sebelum tiap blok dan {ev: 'input', node, name} saat butuh isian. */
function* execList(list, scope, run, quiet) {
  for (const node of list) {
    tick(run)
    if (node.t === 'cm') continue
    run.node = node
    if (!quiet) yield { ev: 'step', node }
    switch (node.t) {
      case 'decl':
        declare(node, scope)
        break
      case 'assign':
        assignTarget(node.target, evaluate(parsed(run, node.expr), scope, run), scope, run)
        break
      case 'input': {
        const m = TARGET_RE.exec(String(node.target ?? ''))
        if (!m) throw new FlowError('Input harus menyebut nama variabel.')
        const variable = lookup(scope, m[1])
        if (quiet) throw new FlowError('Input tidak bisa dipakai di dalam fungsi.')
        const raw = yield { ev: 'input', node, name: m[1] }
        assignTarget(node.target, typedInput(variable.type, raw, m[1]), scope, run)
        break
      }
      case 'output':
        emit(run, formatValue(evaluate(parsed(run, node.expr), scope, run)))
        break
      case 'call': {
        const ast = parsed(run, node.expr)
        if (ast.n !== 'call')
          throw new FlowError('Blok Call harus berisi pemanggilan fungsi, contoh sapa("Ani").')
        callFunction(ast, scope, run)
        break
      }
      case 'if':
        yield* execList(
          condition(run, node.cond, scope, 'If') ? (node.yes ?? []) : (node.no ?? []),
          scope,
          run,
          quiet,
        )
        break
      case 'while':
        while (condition(run, node.cond, scope, 'While')) {
          yield* execList(node.body ?? [], scope, run, quiet)
          tick(run)
          run.node = node
          if (!quiet) yield { ev: 'step', node }
        }
        break
      case 'do':
        for (;;) {
          yield* execList(node.body ?? [], scope, run, quiet)
          run.node = node
          if (!quiet) yield { ev: 'step', node }
          if (!condition(run, node.cond, scope, 'Do While')) break
          tick(run)
        }
        break
      case 'for':
        yield* forLoop(node, scope, run, quiet)
        break
      default:
        throw new FlowError(`Blok "${node.t}" tidak dikenal.`)
    }
  }
}

function* forLoop(node, scope, run, quiet) {
  const variable = lookup(scope, String(node.v ?? '').trim() || '?')
  const start = evaluate(parsed(run, node.from), scope, run)
  const end = evaluate(parsed(run, node.to), scope, run)
  const hasStep = node.step !== undefined && String(node.step).trim() !== ''
  const step = hasStep ? evaluate(parsed(run, node.step), scope, run) : 1
  if (!isNumber(start) || !isNumber(end) || !isNumber(step))
    throw new FlowError('Nilai awal, akhir, dan langkah For harus angka.')
  if (step === 0) throw new FlowError('Langkah (Step) tidak boleh 0.')
  if (variable.arr)
    throw new FlowError(`"${variable.name}" adalah array, tidak bisa dipakai di For.`)
  variable.val = coerce(variable.type, start, variable.name)
  while (step > 0 ? variable.val <= end : variable.val >= end) {
    yield* execList(node.body ?? [], scope, run, quiet)
    variable.val = coerce(variable.type, variable.val + step, variable.name)
    tick(run)
    run.node = node
    if (!quiet) yield { ev: 'step', node }
  }
}

function declare(node, scope) {
  if (!TYPES.includes(node.type)) throw new FlowError(`Tipe "${node.type}" tidak dikenal.`)
  const size = node.size ? Number(node.size) : 0
  if (size && (!Number.isInteger(size) || size < 1 || size > LIMITS.array))
    throw new FlowError(`Jumlah laci array harus 1 sampai ${LIMITS.array}.`)
  for (const raw of node.names ?? []) {
    const name = String(raw).trim()
    if (!name) continue
    if (!NAME_RE.test(name))
      throw new FlowError(
        `Nama variabel "${name}" tidak boleh: harus diawali huruf, tanpa spasi dan garis bawah.`,
      )
    const lower = name.toLowerCase()
    if (RESERVED.includes(lower))
      throw new FlowError(`"${name}" adalah kata yang sudah dipakai Flowgorithm.`)
    if (scope.vars[lower]) throw new FlowError(`Variabel "${name}" sudah dibuat.`)
    scope.vars[lower] = size
      ? {
          type: node.type,
          val: Array.from({ length: size }, () => defaultValue(node.type)),
          arr: true,
          name,
        }
      : { type: node.type, val: defaultValue(node.type), name }
  }
}

function newRun(program) {
  const funcs = {}
  for (const [name, fn] of Object.entries(program?.funcs ?? {})) funcs[name.toLowerCase()] = fn
  return { funcs, count: 0, depth: 0, out: [], cache: new Map(), node: null }
}

/**
 * Jalankan langkah demi langkah (untuk tombol Jalankan/Langkah, konsol & pantau variabel).
 * state: ready | paused | input | done | error. `out` = baris output, `vars()` = isi variabel.
 */
export class Runner {
  constructor(program) {
    this.run = newRun(program)
    this.scope = { vars: {} }
    this.generator = execList(program?.body ?? [], this.scope, this.run, false)
    this.state = 'ready'
    this.current = null
    this.inputName = ''
    this.error = ''
  }

  get out() {
    return this.run.out
  }

  vars() {
    return Object.values(this.scope.vars).map((v) => ({
      name: v.name,
      type: v.arr ? `${v.type}[]` : v.type,
      value: v.arr ? `[${v.val.map(show).join(', ')}]` : show(v.val),
    }))
  }

  advance(value) {
    try {
      const result = this.generator.next(value)
      if (result.done) {
        this.state = 'done'
        this.current = null
        return this.state
      }
      this.current = result.value.node
      if (result.value.ev === 'input') {
        this.state = 'input'
        this.inputName = result.value.name
      } else this.state = 'paused'
    } catch (error) {
      if (!(error instanceof FlowError)) throw error
      this.state = 'error'
      this.error = error.message
      this.current = this.run.node
    }
    return this.state
  }

  step() {
    return this.state === 'ready' || this.state === 'paused' ? this.advance() : this.state
  }

  provide(raw) {
    return this.state === 'input' ? this.advance(raw) : this.state
  }
}

function show(value) {
  return typeof value === 'string' ? `"${value}"` : formatValue(value)
}

/** Jalankan sampai selesai dengan daftar isian. -> { out, error, nodeId } */
export function runProgram(program, inputs = []) {
  const queue = [...inputs]
  const runner = new Runner(program)
  let state = runner.step()
  while (state === 'paused' || state === 'input') {
    if (state === 'input') {
      if (!queue.length) {
        return {
          out: runner.out,
          error: 'Program meminta isian, tetapi tidak ada isian tersedia.',
          nodeId: runner.current?.id ?? null,
        }
      }
      state = runner.provide(queue.shift())
    } else state = runner.step()
  }
  return {
    out: runner.out,
    error: state === 'error' ? runner.error : '',
    nodeId: state === 'error' ? (runner.current?.id ?? null) : null,
  }
}

/**
 * Isian yang dibaca tiap blok Input saat program dijalankan: { idBlok: ['90'] }. Hanya untuk tampilan (nilai
 * isian ditulis di simbol Input pada diagram tebak output); tidak dipakai menilai, jadi tidak ada kembarannya di
 * interpreter Python.
 */
export function inputsByNode(program, inputs = []) {
  const queue = [...inputs]
  const result = {}
  const runner = new Runner(program)
  let state = runner.step()
  while (state === 'paused' || (state === 'input' && queue.length)) {
    if (state === 'input') {
      const raw = queue.shift()
      const id = runner.current?.id
      if (id) (result[id] ??= []).push(raw)
      state = runner.provide(raw)
    } else state = runner.step()
  }
  return result
}

// ---------------------------------------------------------------- pemeriksaan uji

export function normalizeLine(text) {
  return String(text).trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Cocokkan output dengan harapan. "tail" (bawaan) = BARIS TERAKHIR harus sama, jadi pertanyaan seperti
 * "Panjang?" boleh ditampilkan; "exact" = seluruh output sama. Spasi berlebih & huruf besar diabaikan.
 */
export function outputMatches(out, expected, compare = 'tail') {
  const want = expected.map(normalizeLine)
  const tail = want.length ? out.slice(-want.length) : []
  const got = (compare === 'exact' ? out : tail).map(normalizeLine)
  if (compare !== 'exact' && out.length < want.length) return false
  return got.length === want.length && got.every((line, i) => line === want[i])
}

export function checkTests(program, tests, compare = 'tail') {
  return tests.map((test) => {
    const result = runProgram(program, test.inputs ?? [])
    const ok = !result.error && outputMatches(result.out, test.expected ?? [], compare)
    return { ok, out: result.out, error: result.error }
  })
}
