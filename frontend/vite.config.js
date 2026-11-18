import { copyFileSync, createReadStream, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Python di browser (Pyodide) untuk Praktik. File-filenya disajikan sendiri dari /pyodide/ (tidak
// bergantung internet/CDN): saat `npm run dev` dibaca dari node_modules, saat build disalin ke dist/.
const PYODIDE_DIR = resolve('node_modules/pyodide')
const PYODIDE_FILES = [
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
]
const MIME = { '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' }

function pyodideFiles() {
  let outDir = 'dist'
  return {
    name: 'pyodide-files',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      server.middlewares.use('/pyodide', (req, res, next) => {
        const name = req.url.split('?')[0].replace(/^\//, '')
        if (!PYODIDE_FILES.includes(name)) return next()
        const ext = name.slice(name.lastIndexOf('.'))
        res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
        createReadStream(join(PYODIDE_DIR, name)).pipe(res)
      })
    },
    closeBundle() {
      if (!existsSync(outDir)) return
      mkdirSync(join(outDir, 'pyodide'), { recursive: true })
      for (const name of PYODIDE_FILES) {
        copyFileSync(join(PYODIDE_DIR, name), join(outDir, 'pyodide', name))
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), pyodideFiles()],
  // Worker PHP memuat mesin PHP dengan import() dinamis: butuh format ES (bawaan Vite: iife).
  worker: {
    format: 'es',
    // php-wasm (hasil Emscripten) memakai eval secara sengaja; peringatannya tidak perlu ditampilkan.
    rolldownOptions: { checks: { eval: false } },
  },
  // php-wasm mencari berkas .wasm di sebelah modulnya; jangan dipindah ke cache pre-bundle Vite.
  optimizeDeps: { exclude: ['php-wasm'] },
  build: {
    // Editor rumus MathLive (~800 KB) memang besar, tetapi dipisah dan hanya diunduh saat guru
    // membuka dialog "Sisipkan Rumus" — tidak ikut dimuat di halaman lain.
    chunkSizeWarningLimit: 900,
  },
})
