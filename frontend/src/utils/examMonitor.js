// Jendela lain (mis. Alt+Tab ke aplikasi lain) baru dihitung setelah 2 detik, agar kedipan
// fokus sesaat (notifikasi, dialog sistem) tidak langsung dianggap pelanggaran.
export const BLUR_GRACE_MS = 2000
// Satu tindakan bisa memicu beberapa kejadian sekaligus (pindah tab juga keluar layar penuh);
// kejadian dalam 3 detik setelah pelanggaran sebelumnya dihitung satu kali saja.
export const DEDUPE_MS = 3000

/**
 * Memantau siswa keluar dari halaman ujian dan memanggil `onViolation(kind)`:
 * 'hidden' (pindah tab/aplikasi), 'blur' (jendela lain > 2 detik), 'fullscreen_exit'.
 * Juga meminta konfirmasi browser saat tab akan ditutup/di-refresh.
 *
 * Dibuat sebagai fungsi biasa (bukan hook) agar mudah diuji tanpa browser; `doc`, `win`,
 * `now`, `setTimer`, dan `clearTimer` bisa diganti tiruan saat pengujian.
 * Mengembalikan fungsi untuk berhenti memantau.
 */
export function createExamMonitor({
  onViolation,
  requireFullscreen = false,
  doc = document,
  win = window,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let blurTimer = null
  let lastViolation = -Infinity

  const report = (kind) => {
    const time = now()
    if (time - lastViolation < DEDUPE_MS) return
    lastViolation = time
    onViolation(kind)
  }
  const handleVisibility = () => {
    if (doc.hidden) {
      clearTimer(blurTimer)
      report('hidden')
    }
  }
  const handleBlur = () => {
    clearTimer(blurTimer)
    blurTimer = setTimer(() => !doc.hidden && report('blur'), BLUR_GRACE_MS)
  }
  const handleFocus = () => clearTimer(blurTimer)
  const handleFullscreen = () => {
    if (requireFullscreen && !doc.fullscreenElement) report('fullscreen_exit')
  }
  const handleBeforeUnload = (event) => {
    event.preventDefault()
    event.returnValue = ''
  }

  doc.addEventListener('visibilitychange', handleVisibility)
  doc.addEventListener('fullscreenchange', handleFullscreen)
  win.addEventListener('blur', handleBlur)
  win.addEventListener('focus', handleFocus)
  win.addEventListener('beforeunload', handleBeforeUnload)
  return () => {
    clearTimer(blurTimer)
    doc.removeEventListener('visibilitychange', handleVisibility)
    doc.removeEventListener('fullscreenchange', handleFullscreen)
    win.removeEventListener('blur', handleBlur)
    win.removeEventListener('focus', handleFocus)
    win.removeEventListener('beforeunload', handleBeforeUnload)
  }
}
