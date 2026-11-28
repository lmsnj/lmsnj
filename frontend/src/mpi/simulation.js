/**
 * Langkah simulasi: peraga HTML mandiri di frontend/public/mpi/... yang dimuat di iframe
 * sandbox="allow-scripts allow-downloads" (tanpa allow-same-origin -> origin "null", tidak bisa membaca LMS).
 * Protokol postMessage (docs/mpi-simulasi.md):
 *   simulasi -> LMS : mpi:ready, mpi:resize {height}, mpi:progress {detail}, mpi:done {detail}
 *   LMS -> simulasi : mpi:init {params}
 * Fungsi murni, diuji di simulation.test.js. Aturan path sama dengan backend `steps.SIMULATION_SRC`.
 */

export const SIM_MIN_HEIGHT = 240
export const SIM_MAX_HEIGHT = 1400
export const SIM_DEFAULT_HEIGHT = 520
/** Batas menunggu mpi:ready sebelum siswa diizinkan lanjut tanpa simulasi. */
export const SIM_READY_TIMEOUT = 8000

const SRC_RE = /^\/mpi\/(?!.*\.\.)[\w./-]+\.html?(\?[\w=&.%-]*)?$/i

/** Hanya file .html di /mpi/ aplikasi ini (bukan URL luar, javascript:, data:, atau ".."). */
export function isSafeSimulationSrc(src) {
  return typeof src === 'string' && SRC_RE.test(src.trim())
}

export function clampHeight(value) {
  return Math.round(Math.min(SIM_MAX_HEIGHT, Math.max(SIM_MIN_HEIGHT, value)))
}

/**
 * Pesan dari iframe -> { type, height?, detail? } yang sudah dibersihkan, atau null bila ditolak.
 * `fromFrame` = event.source === iframe.contentWindow milik langkah itu (origin selalu "null").
 */
export function parseSimulationMessage(data, fromFrame) {
  if (!fromFrame || !data || typeof data !== 'object' || typeof data.type !== 'string') return null
  const detail = data.detail && typeof data.detail === 'object' ? data.detail : {}
  switch (data.type) {
    case 'mpi:ready':
      return { type: 'ready' }
    case 'mpi:resize':
      return typeof data.height === 'number' && Number.isFinite(data.height)
        ? { type: 'resize', height: clampHeight(data.height) }
        : null
    case 'mpi:progress':
      return { type: 'progress', detail }
    case 'mpi:done':
      return { type: 'done', detail }
    default:
      return null
  }
}

export function simulationInit(params) {
  return {
    type: 'mpi:init',
    params: params && typeof params === 'object' && !Array.isArray(params) ? params : {},
  }
}

/** Teks Params di Studio -> { value } atau { error }. Kosong = {}. */
export function parseParams(text) {
  if (!String(text ?? '').trim()) return { value: {} }
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return { error: 'Params harus objek JSON, mis. {"target": 81}.' }
    return { value }
  } catch {
    return { error: 'JSON belum benar (periksa tanda kutip dan koma).' }
  }
}
