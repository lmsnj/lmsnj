/**
 * Ekspresi di blok flowchart (fungsi murni, diuji di expression.test.js).
 *
 * Nilai: angka, teks ("..." atau '...'), benar/salah. Nama variabel tidak membedakan huruf besar/kecil.
 * Operator (urutan dari yang paling lemah):
 *   atau / or / ||
 *   dan / and / &&
 *   tidak / not / !
 *   = == != <> < > <= >=          (di flowchart, = berarti "sama dengan", bukan memberi nilai)
 *   &                             (menggabung teks)
 *   + -                           (+ juga menggabung jika salah satunya teks)
 *   * / div mod %                 (div = bagi bulat, mod/% = sisa bagi)
 *   ^                             (pangkat)
 *   - di depan angka
 * Fungsi: akar/sqrt, abs/mutlak, bulatkan/round, int/bulat (buang desimal), panjang/len.
 */

export class FlowError extends Error {
  constructor(message, blockId = null) {
    super(message)
    this.blockId = blockId
  }
}

const WORDS = {
  atau: 'or', or: 'or',
  dan: 'and', and: 'and',
  tidak: 'not', not: 'not',
  div: 'div', mod: 'mod',
  benar: 'true', true: 'true',
  salah: 'false', false: 'false',
} // prettier-ignore

const FUNCTIONS = {
  akar: (x) => checkedSqrt(x),
  sqrt: (x) => checkedSqrt(x),
  abs: (x) => Math.abs(number(x)),
  mutlak: (x) => Math.abs(number(x)),
  bulatkan: (x) => Math.round(number(x)),
  round: (x) => Math.round(number(x)),
  int: (x) => Math.trunc(number(x)),
  bulat: (x) => Math.trunc(number(x)),
  panjang: (x) => String(x).length,
  len: (x) => String(x).length,
}

function checkedSqrt(x) {
  const value = number(x)
  if (value < 0) throw new FlowError('Akar dari bilangan negatif tidak bisa dihitung.')
  return Math.sqrt(value)
}

function number(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') throw new FlowError('Nilai benar/salah tidak bisa dihitung.')
  throw new FlowError(`“${value}” bukan angka.`)
}

const TOKEN =
  /\s*(?:(\d+(?:\.\d+)?)|("[^"]*"|'[^']*')|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|<>|!=|==|&&|\|\||[-+*/%^()=<>&!,]))/y

export function tokenize(text) {
  const source = String(text ?? '')
  const tokens = []
  TOKEN.lastIndex = 0
  let index = 0
  while (index < source.length) {
    if (!source.slice(index).trim()) break
    TOKEN.lastIndex = index
    const match = TOKEN.exec(source)
    if (!match) {
      const char = source.slice(index).trim()[0]
      throw new FlowError(`Tanda “${char}” tidak dikenali.`)
    }
    index = TOKEN.lastIndex
    const [, num, str, name, op] = match
    if (num) tokens.push({ type: 'num', value: Number(num) })
    else if (str) tokens.push({ type: 'str', value: str.slice(1, -1) })
    else if (name) {
      const lower = name.toLowerCase()
      tokens.push(
        WORDS[lower] ? { type: 'op', value: WORDS[lower] } : { type: 'name', value: lower },
      )
    } else {
      const map = { '&&': 'and', '||': 'or', '!': 'not', '==': '=', '<>': '!=', '%': 'mod' }
      tokens.push({ type: 'op', value: map[op] ?? op })
    }
  }
  return tokens
}

// Kekuatan operator dua sisi (makin besar makin kuat).
const BINARY = {
  or: 1, and: 2,
  '=': 4, '!=': 4, '<': 4, '>': 4, '<=': 4, '>=': 4,
  '&': 5, '+': 6, '-': 6,
  '*': 7, '/': 7, div: 7, mod: 7,
  '^': 9,
} // prettier-ignore

/** Teks ekspresi -> pohon ekspresi. Melempar FlowError jika penulisannya salah. */
export function parseExpression(text) {
  const tokens = tokenize(text)
  if (!tokens.length) throw new FlowError('Ekspresi masih kosong.')
  let position = 0
  const peek = () => tokens[position]
  const next = () => tokens[position++]
  const expect = (value) => {
    const token = next()
    if (!token || token.value !== value) {
      throw new FlowError(
        token ? `Ada “${token.value}” yang tidak pada tempatnya.` : `Kurang “${value}”.`,
      )
    }
  }

  function prefix() {
    const token = next()
    if (!token) throw new FlowError('Ekspresi belum lengkap.')
    if (token.type === 'num' || token.type === 'str') return { kind: 'lit', value: token.value }
    if (token.type === 'name') {
      if (peek()?.value === '(') {
        if (!FUNCTIONS[token.value]) throw new FlowError(`Fungsi “${token.value}” tidak dikenal.`)
        next()
        const arg = expression(0)
        expect(')')
        return { kind: 'call', name: token.value, arg }
      }
      return { kind: 'var', name: token.value }
    }
    if (token.value === 'true' || token.value === 'false') {
      return { kind: 'lit', value: token.value === 'true' }
    }
    if (token.value === '(') {
      const inner = expression(0)
      expect(')')
      return inner
    }
    if (token.value === '-') return { kind: 'neg', arg: expression(8) }
    if (token.value === '+') return expression(8)
    if (token.value === 'not') return { kind: 'not', arg: expression(3) }
    throw new FlowError(`Ada “${token.value}” yang tidak pada tempatnya.`)
  }

  function expression(minPower) {
    let left = prefix()
    for (;;) {
      const token = peek()
      const power = token?.type === 'op' ? BINARY[token.value] : undefined
      if (power === undefined || power <= minPower) break
      next()
      // ^ dihitung dari kanan (2^3^2 = 2^(3^2)), operator lain dari kiri.
      const right = expression(token.value === '^' ? power - 1 : power)
      left = { kind: 'bin', op: token.value, left, right }
    }
    return left
  }

  const tree = expression(0)
  if (position < tokens.length) {
    throw new FlowError(`Ada “${tokens[position].value}” yang tidak pada tempatnya.`)
  }
  return tree
}

function truthy(value) {
  if (typeof value === 'boolean') return value
  throw new FlowError('Kondisi harus bernilai benar/salah, mis. nilai >= 75.')
}

function compare(op, a, b) {
  if (typeof a !== typeof b && op !== '=' && op !== '!=') {
    throw new FlowError('Tidak bisa membandingkan angka dengan teks.')
  }
  switch (op) {
    case '=': return a === b
    case '!=': return a !== b
    case '<': return a < b
    case '>': return a > b
    case '<=': return a <= b
    default: return a >= b
  } // prettier-ignore
}

/** Hitung pohon ekspresi dengan variabel `vars` (Map nama -> nilai). */
export function evaluate(node, vars) {
  switch (node.kind) {
    case 'lit':
      return node.value
    case 'var':
      if (!vars.has(node.name)) throw new FlowError(`Variabel “${node.name}” belum diberi nilai.`)
      return vars.get(node.name)
    case 'neg':
      return -number(evaluate(node.arg, vars))
    case 'not':
      return !truthy(evaluate(node.arg, vars))
    case 'call':
      return FUNCTIONS[node.name](evaluate(node.arg, vars))
    default:
      break
  }
  const { op } = node
  if (op === 'and') return truthy(evaluate(node.left, vars)) && truthy(evaluate(node.right, vars))
  if (op === 'or') return truthy(evaluate(node.left, vars)) || truthy(evaluate(node.right, vars))
  const a = evaluate(node.left, vars)
  const b = evaluate(node.right, vars)
  if (op === '&') return formatValue(a) + formatValue(b)
  if (op === '+' && (typeof a === 'string' || typeof b === 'string'))
    return formatValue(a) + formatValue(b)
  if (['=', '!=', '<', '>', '<=', '>='].includes(op)) return compare(op, a, b)
  const x = number(a)
  const y = number(b)
  switch (op) {
    case '+': return x + y
    case '-': return x - y
    case '*': return x * y
    case '^': return x ** y
    default: break
  } // prettier-ignore
  if (y === 0) throw new FlowError('Ada pembagian dengan nol.')
  if (op === '/') return x / y
  if (op === 'div') return Math.trunc(x / y)
  return x % y // mod
}

/** Nilai -> teks keluaran: 7 (bukan 7.0), 2.5, benar/salah. */
export function formatValue(value) {
  if (typeof value === 'boolean') return value ? 'benar' : 'salah'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new FlowError('Hasil perhitungan terlalu besar.')
    return String(Number(value.toPrecision(12)))
  }
  return String(value)
}
