/**
 * Bridge konten HTML5/H5P <-> pemutar MPI lewat postMessage (spesifikasi: docs/mpi-bridge.md). Fungsi murni,
 * diuji di bridge.test.js. Konten selalu dimuat di iframe sandbox dari ORIGIN LAIN; pesan diterima hanya jika
 * berasal dari iframe itu, origin-nya sama dengan alamat konten, dan membawa nonce yang dikirim pemutar.
 */

export const BRIDGE_VERSION = 1
const TYPES = new Set(['mpi:ready', 'mpi:progress', 'mpi:complete', 'mpi:resize'])
export const MIN_HEIGHT = 200
export const MAX_HEIGHT = 1200

export function contentOrigin(url) {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * Boleh ditampilkan? https dan origin berbeda dari halaman LMS (origin sama + sandbox allow-same-origin =
 * sandbox bisa dijebol). `allowLoopbackHttp` hanya untuk mencoba di laptop (http://127.x.x.x).
 */
export function isSafeEmbed(url, pageOrigin, allowLoopbackHttp = false) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const loopback =
    allowLoopbackHttp && parsed.protocol === 'http:' && parsed.hostname.startsWith('127.')
  if (parsed.protocol !== 'https:' && !loopback) return false
  if (parsed.username || parsed.password) return false
  return parsed.origin !== pageOrigin
}

export function newNonce() {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
}

export function initMessage(nonce, stepId, nickname) {
  return {
    source: 'lms-sigma',
    type: 'mpi:init',
    version: BRIDGE_VERSION,
    nonce,
    step: stepId,
    user: { nickname },
  }
}

const finite = (value) => typeof value === 'number' && Number.isFinite(value)

/**
 * Pesan dari iframe -> perintah yang sudah dibersihkan, atau null bila ditolak.
 * `event` = { origin, data, fromFrame } (fromFrame = event.source === iframe.contentWindow).
 */
export function parseMessage(event, expectedOrigin, nonce) {
  if (!event?.fromFrame || event.origin !== expectedOrigin) return null
  const data = event.data
  if (!data || typeof data !== 'object' || data.source !== 'mpi-content' || data.nonce !== nonce)
    return null
  if (!TYPES.has(data.type)) return null
  switch (data.type) {
    case 'mpi:progress':
      return finite(data.value)
        ? { type: 'progress', value: Math.min(1, Math.max(0, data.value)) }
        : null
    case 'mpi:resize':
      return finite(data.height)
        ? {
            type: 'resize',
            height: Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, data.height))),
          }
        : null
    case 'mpi:complete': {
      const hasScore = finite(data.score) && finite(data.max) && data.max > 0 && data.score >= 0
      return hasScore
        ? { type: 'complete', score: Math.min(data.score, data.max), max: data.max }
        : { type: 'complete', score: null, max: null }
    }
    default:
      return { type: 'ready' }
  }
}

/**
 * Konten H5P (h5p.org, Moodle, WordPress) memakai protokol resizer sendiri: {context: 'h5p', action}.
 * -> { reply, height } (balasan untuk iframe dan/atau tinggi baru), atau null.
 */
export function h5pMessage(event, expectedOrigin) {
  if (!event?.fromFrame || event.origin !== expectedOrigin) return null
  const data = event.data
  if (!data || data.context !== 'h5p') return null
  const height = finite(data.scrollHeight)
    ? Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, data.scrollHeight)))
    : null
  if (data.action === 'hello') return { reply: { context: 'h5p', action: 'hello' }, height: null }
  if (data.action === 'prepareResize')
    return { reply: { context: 'h5p', action: 'resizePrepared' }, height }
  if (data.action === 'resize') return { reply: null, height }
  return null
}
