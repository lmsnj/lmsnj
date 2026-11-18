// Web Worker: menjalankan Python siswa dengan Pyodide (Python di browser). Berjalan terpisah dari
// halaman, jadi kode siswa tidak bisa membaca token login, dan perulangan tanpa akhir bisa dihentikan
// dengan mematikan worker (pythonRunner.js).
import { PYTHON_RUNNER } from '../utils/codePractice.js'

let pyodide = null

function boot(indexURL) {
  if (!pyodide) {
    pyodide = import(/* @vite-ignore */ `${indexURL}pyodide.mjs`).then(async ({ loadPyodide }) => {
      const py = await loadPyodide({ indexURL })
      py.runPython(PYTHON_RUNNER)
      return py
    })
    pyodide.catch(() => {
      pyodide = null // coba muat ulang di permintaan berikutnya
    })
  }
  return pyodide
}

// { id, code, runs: [{ input, showPrompt }], indexURL } -> { id, kind: 'started' | 'done' | 'error' }
self.onmessage = async ({ data }) => {
  const { id, code, runs, indexURL } = data
  try {
    const py = await boot(indexURL)
    self.postMessage({ id, kind: 'started' })
    const run = py.globals.get('__lms_run')
    const results = runs.map(({ input, showPrompt }) => {
      const result = run(code, input, showPrompt)
      const [output, error] = result.toJs()
      result.destroy()
      return { output, error: error ?? null }
    })
    run.destroy()
    self.postMessage({ id, kind: 'done', results })
  } catch (error) {
    self.postMessage({ id, kind: 'error', message: String(error?.message ?? error) })
  }
}
