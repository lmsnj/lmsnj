import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Editor rumus MathLive (~800 KB) memang besar, tetapi dipisah dan hanya diunduh saat guru
    // membuka dialog "Sisipkan Rumus" — tidak ikut dimuat di halaman lain.
    chunkSizeWarningLimit: 900,
  },
})
