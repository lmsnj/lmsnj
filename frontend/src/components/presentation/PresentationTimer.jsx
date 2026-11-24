import { Pause, Play, Plus, RotateCcw, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  addMinute,
  formatClock,
  newTimer,
  resetTimer,
  timerLeft,
  toggleTimer,
} from '../../utils/presentation'

// Timer hitung mundur di pojok layar presentasi. Durasi awal = pengaturan presentasi.timer_default.
export default function PresentationTimer({ minutes, buttonClass }) {
  const [timer, setTimer] = useState(() => newTimer(minutes))
  const [now, setNow] = useState(() => Date.now())
  const running = timer.runningSince !== null

  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [running])

  const left = timerLeft(timer, running ? now : 0)
  const update = (change) => {
    const at = Date.now()
    setNow(at)
    setTimer((current) => change(current, at))
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Timer">
      <span
        className={`flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-lg font-bold tabular-nums ${
          left === 0 ? 'animate-pulse bg-red-600 text-white' : ''
        }`}
        aria-live={left === 0 ? 'assertive' : 'off'}
      >
        <Timer className="size-5" aria-hidden="true" />
        {left === 0 ? 'Waktu habis' : formatClock(left)}
      </span>
      <button
        type="button"
        className={buttonClass}
        onClick={() => update(toggleTimer)}
        title={running ? 'Jeda timer' : 'Mulai timer'}
        aria-label={running ? 'Jeda timer' : 'Mulai timer'}
      >
        {running ? (
          <Pause className="size-5" aria-hidden="true" />
        ) : (
          <Play className="size-5" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={() => update((current, at) => addMinute(current, at))}
        title="Tambah 1 menit"
        aria-label="Tambah 1 menit"
      >
        <Plus className="size-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={() => update(resetTimer)}
        title="Ulangi timer"
        aria-label="Ulangi timer"
      >
        <RotateCcw className="size-5" aria-hidden="true" />
      </button>
    </div>
  )
}
