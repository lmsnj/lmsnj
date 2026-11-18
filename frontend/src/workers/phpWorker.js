// Web Worker: menjalankan PHP siswa (php-wasm, PHP 8.4 di browser). Hanya versi 8.4 yang dimuat (bukan
// semua versi) dengan menurunkan PhpWebBase langsung. Setiap kali dijalankan memakai proses PHP BARU,
// karena fungsi/konstanta dari percobaan sebelumnya ikut tersimpan ("Cannot redeclare function").
import { PhpWebBase } from 'php-wasm/PhpWebBase.mjs'
import { phpPrelude, splitPhpOutput } from '../utils/codePractice.js'

// Pemuat PHP versi web menyebut `document` & `window` saat mulai (daftar target event untuk grafis SDL,
// yang tidak dipakai di sini). Worker tidak punya keduanya, jadi diberi pengganti minimal.
globalThis.window ??= globalThis
globalThis.document ??= {
  querySelector: () => null,
  querySelectorAll: () => [], // dipakai klien Vite saat `npm run dev`
  addEventListener() {},
  removeEventListener() {},
}

class Php84 extends PhpWebBase {
  constructor(args = {}) {
    // autoTransaction: false = tanpa sinkron berkas ke IndexedDB (tidak dibutuhkan untuk latihan).
    super(import('php-wasm/php8.4-web.mjs'), { version: '8.4', autoTransaction: false, ...args })
  }
}

// Siap = event 'ready'; gagal memuat (php.binary ditolak) juga diteruskan agar tidak menunggu selamanya.
const ready = (php) =>
  new Promise((resolve, reject) => {
    php.addEventListener('ready', resolve, { once: true })
    php.binary.catch(reject)
  })

// Proses pertama memaksa unduh & kompilasi PHP (13 MB) SEBELUM batas waktu program dihitung.
let warm = null
function boot() {
  if (!warm) {
    warm = ready(new Php84())
    warm.catch(() => {
      warm = null
    })
  }
  return warm
}

async function runOnce(code, input) {
  const php = new Php84()
  let output = ''
  php.addEventListener('output', (event) => {
    output += event.detail.join('')
  })
  php.addEventListener('error', (event) => {
    output += event.detail.join('')
  })
  await ready(php)
  await php.run(phpPrelude(input))
  output = ''
  await php.run(code)
  return splitPhpOutput(output)
}

// { id, code, runs: [{ input }] } -> { id, kind: 'started' | 'done' | 'error' }
self.onmessage = async ({ data }) => {
  const { id, code, runs } = data
  try {
    await boot()
    self.postMessage({ id, kind: 'started' })
    const results = []
    for (const { input } of runs) results.push(await runOnce(code, input))
    self.postMessage({ id, kind: 'done', results })
  } catch (error) {
    self.postMessage({ id, kind: 'error', message: String(error?.message ?? error) })
  }
}
