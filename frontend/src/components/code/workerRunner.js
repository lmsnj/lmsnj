// Menjalankan kode Python/PHP siswa di Web Worker (workers/pythonWorker.js, workers/phpWorker.js).
// Mesin bahasanya (Pyodide ~12 MB, PHP ~13 MB) diunduh sekali dari server LMS sendiri, lalu disimpan
// browser. Kode siswa berjalan terpisah dari halaman: tidak bisa membaca token login, dan program yang
// tidak berhenti bisa dimatikan.
const LOAD_TIMEOUT = 120_000
const RUN_TIMEOUT = 8_000

// Vite menggabungkan setiap worker hanya jika `new Worker(new URL(...))` ditulis langsung seperti ini.
const WORKERS = {
  python: {
    name: 'Python',
    create: () =>
      new Worker(new URL('../../workers/pythonWorker.js', import.meta.url), { type: 'module' }),
  },
  php: {
    name: 'PHP',
    create: () =>
      new Worker(new URL('../../workers/phpWorker.js', import.meta.url), { type: 'module' }),
  },
}

const workers = {}
let sequence = 0

/**
 * runs = [{ input, showPrompt }] -> Promise<[{ output, error }]>. `onStatus('loading' | 'running')`.
 * Program yang berjalan terlalu lama (mis. perulangan tanpa akhir) dihentikan: worker dimatikan dan
 * dibuat ulang pada percobaan berikutnya.
 */
export function runCode(language, code, runs, { onStatus } = {}) {
  const spec = WORKERS[language]
  return new Promise((resolve, reject) => {
    if (!workers[language]) workers[language] = spec.create()
    const current = workers[language]
    const id = ++sequence
    let timer = null

    const cleanup = () => {
      clearTimeout(timer)
      current.removeEventListener('message', onMessage)
      current.removeEventListener('error', onError)
    }
    const fail = (message) => {
      cleanup()
      current.terminate()
      if (workers[language] === current) delete workers[language]
      reject(new Error(message))
    }
    function onMessage({ data }) {
      if (data.id !== id) return
      if (data.kind === 'started') {
        onStatus?.('running')
        clearTimeout(timer)
        timer = setTimeout(
          () =>
            fail(
              `Program berjalan lebih dari ${RUN_TIMEOUT / 1000} detik lalu dihentikan. ` +
                'Periksa perulangan yang tidak pernah berhenti.',
            ),
          RUN_TIMEOUT * Math.max(1, runs.length),
        )
      } else if (data.kind === 'done') {
        cleanup()
        resolve(data.results)
      } else if (data.kind === 'error') {
        cleanup()
        reject(new Error(`${spec.name} gagal dijalankan: ${data.message}`))
      }
    }

    // Worker gagal dimuat/macet (mis. berkas tidak ditemukan): beri tahu segera, jangan menunggu batas waktu.
    function onError(event) {
      event.preventDefault()
      fail(
        `${spec.name} gagal dimuat${event.message ? `: ${event.message}` : '.'} Coba muat ulang halaman.`,
      )
    }

    timer = setTimeout(
      () => fail(`${spec.name} gagal dimuat. Periksa koneksi internet lalu coba lagi.`),
      LOAD_TIMEOUT,
    )
    current.addEventListener('message', onMessage)
    current.addEventListener('error', onError)
    onStatus?.('loading')
    const indexURL = new URL(`${import.meta.env.BASE_URL}pyodide/`, window.location.origin).href
    current.postMessage({ id, code, runs, indexURL })
  })
}

export const LANGUAGE_NAMES = Object.fromEntries(
  Object.entries(WORKERS).map(([key, spec]) => [key, spec.name]),
)
