import {
  AArrowDown,
  AArrowUp,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Moon,
  MonitorPlay,
  Sun,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { keyAction, stepZoom, ZOOM_LEVELS, zoomIndexFor } from '../../utils/presentation'
import PresentationTimer from './PresentationTimer'

const IDLE_MS = 3000

// Jenis elemen yang sedang fokus, untuk memutuskan apakah tombol dipakai presentasi (lihat keyAction).
function keyTarget(element) {
  if (!element || element === document.body) return 'body'
  if (element.closest('input, textarea, select, [contenteditable="true"]')) return 'typing'
  if (element.closest('button, a, [role="button"]')) return 'control'
  if (element.closest('[data-present-stage="media"]')) return 'frame'
  return 'body'
}

function inFullscreen() {
  return Boolean(document.fullscreenElement)
}

/**
 * Bingkai layar presentasi kelas (TV): layar mulai -> layar penuh tanpa menu, navigasi dengan
 * klik, panah/PageUp/PageDown/Spasi (remote presenter), B atau titik = layar hitam.
 * Pojok bawah: kembali, slide sebelumnya/berikutnya, timer, ukuran huruf, tema, layar penuh.
 * - `settings`: nilai berlaku dari /api/school-settings/effective/ (presentasi.*)
 * - `onAction('next' | 'prev' | 'first' | 'last')`
 * - `children({ dark })`: isi layar
 */
export default function PresentationFrame({
  title,
  subtitle,
  settings,
  counter,
  canPrev = true,
  canNext = true,
  onAction,
  onBack,
  stage = 'slides',
  children,
}) {
  const [started, setStarted] = useState(false)
  const [dark, setDark] = useState(settings['presentasi.tema'] !== 'terang')
  const [zoom, setZoom] = useState(() => zoomIndexFor(settings['presentasi.ukuran_huruf']))
  const [black, setBlack] = useState(false)
  const [idle, setIdle] = useState(false)
  const [fullscreen, setFullscreen] = useState(inFullscreen)
  const actionRef = useRef(onAction)
  useEffect(() => {
    actionRef.current = onAction
  })

  useEffect(() => {
    const update = () => setFullscreen(inFullscreen())
    document.addEventListener('fullscreenchange', update)
    return () => {
      document.removeEventListener('fullscreenchange', update)
      // Keluar dari layar penuh saat halaman presentasi ditinggalkan.
      if (inFullscreen()) document.exitFullscreen?.().catch(() => {})
    }
  }, [])

  // Keyboard & remote presenter.
  useEffect(() => {
    if (!started) return undefined
    const onKey = (event) => {
      const modifiers = event.ctrlKey || event.altKey || event.metaKey
      const action = keyAction(event.key, keyTarget(event.target), modifiers)
      if (!action) return
      event.preventDefault()
      if (action === 'black') setBlack((value) => !value)
      else {
        setBlack(false)
        actionRef.current?.(action)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [started])

  // Tombol & kursor disembunyikan saat tetikus diam agar layar TV bersih.
  useEffect(() => {
    if (!started) return undefined
    let timeout = setTimeout(() => setIdle(true), IDLE_MS)
    const wake = () => {
      setIdle(false)
      clearTimeout(timeout)
      timeout = setTimeout(() => setIdle(true), IDLE_MS)
    }
    const events = ['mousemove', 'pointerdown', 'keydown', 'touchstart']
    events.forEach((name) => window.addEventListener(name, wake))
    return () => {
      clearTimeout(timeout)
      events.forEach((name) => window.removeEventListener(name, wake))
    }
  }, [started])

  const toggleFullscreen = () => {
    if (inFullscreen()) document.exitFullscreen?.().catch(() => {})
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }
  const start = () => {
    // iPhone tidak mendukung layar penuh untuk halaman web; presentasi tetap jalan tanpa itu.
    if (!inFullscreen()) document.documentElement.requestFullscreen?.().catch(() => {})
    setStarted(true)
  }

  const tone = dark ? 'bg-slate-950 text-slate-50' : 'bg-white text-slate-900'
  const barTone = dark ? 'bg-slate-900/95 ring-slate-700' : 'bg-slate-50/95 ring-slate-200'
  const buttonClass = `flex size-11 items-center justify-center rounded-lg transition disabled:opacity-30 ${
    dark ? 'hover:bg-slate-700' : 'hover:bg-slate-200'
  }`

  return (
    <div className={`fixed inset-0 flex flex-col ${tone} ${idle && !black ? 'cursor-none' : ''}`}>
      <main
        className="relative min-h-0 flex-1 overflow-y-auto"
        style={{ zoom: ZOOM_LEVELS[zoom] }}
        data-present-stage={stage}
      >
        {children({ dark })}
      </main>

      <footer
        className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ring-1 transition-opacity duration-500 ${barTone} ${
          idle ? 'opacity-0 focus-within:opacity-100 hover:opacity-100' : 'opacity-100'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" className={buttonClass} onClick={onBack} title="Kembali">
            <ArrowLeft className="size-5" aria-hidden="true" />
            <span className="sr-only">Kembali</span>
          </button>
          <p className="hidden max-w-[40vw] truncate text-sm font-semibold sm:block">{title}</p>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className={buttonClass}
            onClick={() => onAction('prev')}
            disabled={!canPrev}
            title="Sebelumnya (←)"
            aria-label="Sebelumnya"
          >
            <ChevronLeft className="size-6" aria-hidden="true" />
          </button>
          {counter && (
            <span className="min-w-16 text-center text-sm font-semibold tabular-nums">
              {counter}
            </span>
          )}
          <button
            type="button"
            className={buttonClass}
            onClick={() => onAction('next')}
            disabled={!canNext}
            title="Berikutnya (→)"
            aria-label="Berikutnya"
          >
            <ChevronRight className="size-6" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {settings['presentasi.tampil_timer'] !== false && (
            <PresentationTimer
              minutes={settings['presentasi.timer_default']}
              buttonClass={buttonClass}
            />
          )}
          <button
            type="button"
            className={buttonClass}
            onClick={() => setZoom((value) => stepZoom(value, -1))}
            disabled={zoom === 0}
            title="Perkecil huruf"
            aria-label="Perkecil huruf"
          >
            <AArrowDown className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => setZoom((value) => stepZoom(value, 1))}
            disabled={zoom === ZOOM_LEVELS.length - 1}
            title="Perbesar huruf"
            aria-label="Perbesar huruf"
          >
            <AArrowUp className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => setDark((value) => !value)}
            title={dark ? 'Tema terang' : 'Tema gelap'}
            aria-label={dark ? 'Tema terang' : 'Tema gelap'}
          >
            {dark ? (
              <Sun className="size-5" aria-hidden="true" />
            ) : (
              <Moon className="size-5" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={toggleFullscreen}
            title={fullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
            aria-label={fullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
          >
            {fullscreen ? (
              <Minimize className="size-5" aria-hidden="true" />
            ) : (
              <Maximize className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </footer>

      {black && (
        <button
          type="button"
          className="fixed inset-0 z-50 cursor-none bg-black"
          onClick={() => setBlack(false)}
          aria-label="Layar hitam. Tekan untuk kembali."
        />
      )}

      {!started && (
        <div className={`fixed inset-0 z-40 flex items-center justify-center p-6 ${tone}`}>
          <div className="max-w-xl text-center">
            <MonitorPlay className="mx-auto size-16 text-brand-500" aria-hidden="true" />
            {subtitle && <p className="mt-4 text-sm font-semibold opacity-70">{subtitle}</p>}
            <h1 className="mt-1 text-3xl font-bold">{title}</h1>
            <button
              type="button"
              autoFocus
              onClick={start}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-lg font-semibold text-white hover:bg-brand-700"
            >
              <MonitorPlay className="size-5" aria-hidden="true" /> Mulai Presentasi
            </button>
            <p className="mt-6 text-sm opacity-70">
              Pindah: klik tombol di bawah, panah kiri/kanan, Spasi, atau remote presenter
              (PageUp/PageDown). Tekan B untuk layar hitam.
            </p>
            <button
              type="button"
              onClick={onBack}
              className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold opacity-80 hover:opacity-100"
            >
              <ArrowLeft className="size-4" aria-hidden="true" /> Kembali
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
