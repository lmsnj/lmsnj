import { CircleCheck, CircleX, ListChecks, Play, RotateCcw, StepForward } from 'lucide-react'
import { useRef, useState } from 'react'
import Button from '../../../components/Button'
import { checkTests, Runner } from './interpreter'

/**
 * Panel menjalankan program di browser: Jalankan, Langkah (satu blok), Ulangi; Console (output + isian)
 * dan pantau variabel. Dipasang dengan `key` = isi program, jadi ubahan program otomatis mengulang.
 * `onMark({active, error})` = blok yang sedang jalan / error (untuk ditandai di editor & flowchart).
 * `examples` = uji contoh yang boleh dicoba sendiri sebelum dikirim (penilaian tetap di server).
 */
export default function ProgramRunner({
  program,
  examples = [],
  compare = 'tail',
  onMark,
  inputs = [],
}) {
  const runnerRef = useRef(null)
  const [lines, setLines] = useState([])
  const [vars, setVars] = useState([])
  const [state, setState] = useState('ready')
  const [answer, setAnswer] = useState('')
  const [inputName, setInputName] = useState('')
  const [checks, setChecks] = useState(null)
  const autoRef = useRef(false)

  const mark = (runner) => {
    onMark?.({
      active:
        runner && runner.state !== 'done' && runner.state !== 'error'
          ? (runner.current?.id ?? null)
          : null,
      error: runner?.state === 'error' ? (runner.current?.id ?? null) : null,
    })
  }

  // Majukan runner; output baru ditambahkan ke Console. auto = terus sampai butuh isian/selesai/error.
  const advance = (runner, auto, provided) => {
    const before = runner.out.length
    let next = provided === undefined ? runner.step() : runner.provide(provided)
    while (auto && next === 'paused') next = runner.step()
    const added = runner.out.slice(before).map((text) => ({ kind: 'out', text }))
    setLines((current) => [
      ...current,
      ...(provided === undefined ? [] : [{ kind: 'in', text: provided }]),
      ...added,
      ...(next === 'error' ? [{ kind: 'err', text: `Galat: ${runner.error}` }] : []),
    ])
    setVars(runner.vars())
    setState(next)
    setInputName(runner.inputName)
    mark(runner)
  }

  const start = () => {
    const runner = new Runner(program)
    runnerRef.current = runner
    setLines([])
    setChecks(null)
    return runner
  }
  const usable = () => {
    const runner = runnerRef.current
    return runner && !['done', 'error'].includes(runner.state) ? runner : start()
  }
  const run = () => {
    autoRef.current = true
    const runner = usable()
    if (runner.state !== 'input') advance(runner, true)
  }
  const step = () => {
    autoRef.current = false
    const runner = usable()
    if (runner.state !== 'input') advance(runner, false)
  }
  const reset = () => {
    runnerRef.current = null
    setLines([])
    setVars([])
    setState('ready')
    setChecks(null)
    mark(null)
  }
  const submit = (event) => {
    event.preventDefault()
    const runner = runnerRef.current
    if (!runner || runner.state !== 'input') return
    const value = answer
    setAnswer('')
    advance(runner, autoRef.current, value)
  }

  const status = {
    ready: 'Tekan Jalankan, atau Langkah untuk menjalankan satu blok demi satu blok.',
    paused: 'Berhenti sejenak. Blok yang akan dijalankan ditandai kuning.',
    input: `Program menunggu isian untuk ${inputName}.`,
    done: 'Program selesai dijalankan.',
    error: 'Program berhenti karena galat. Blok yang salah ditandai merah.',
  }[state]

  return (
    <div className="@container space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={run}>
          <Play className="size-4" aria-hidden="true" /> Jalankan
        </Button>
        <Button size="sm" variant="secondary" onClick={step}>
          <StepForward className="size-4" aria-hidden="true" /> Langkah
        </Button>
        <Button size="sm" variant="secondary" onClick={reset}>
          <RotateCcw className="size-4" aria-hidden="true" /> Ulangi
        </Button>
        {examples.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              reset()
              setChecks(checkTests(program, examples, compare))
            }}
          >
            <ListChecks className="size-4" aria-hidden="true" /> Coba contoh uji
          </Button>
        )}
      </div>
      <p className="text-[0.85em] text-slate-600" aria-live="polite">
        {status}
      </p>
      {inputs.length > 0 && (
        <p className="text-[0.85em] text-slate-500">Contoh isian: {inputs.join(', ')}</p>
      )}

      <div className="grid gap-3 @lg:grid-cols-[1fr_14rem]">
        <div className="overflow-hidden rounded-lg bg-slate-900 text-slate-100">
          <p className="bg-slate-800 px-3 py-1 text-xs font-bold tracking-wide">CONSOLE</p>
          <div
            className="max-h-56 min-h-24 space-y-0.5 overflow-y-auto p-3 font-mono text-[0.9em]"
            role="log"
          >
            {lines.map((line, i) => (
              <p
                key={i}
                className={
                  line.kind === 'in'
                    ? 'text-sky-300'
                    : line.kind === 'err'
                      ? 'text-red-300'
                      : 'whitespace-pre-wrap'
                }
              >
                {line.kind === 'in' ? `> ${line.text}` : line.text}
              </p>
            ))}
          </div>
          {state === 'input' && (
            <form onSubmit={submit} className="flex gap-2 border-t border-slate-700 p-2">
              <input
                autoFocus
                aria-label={`Isian untuk ${inputName || 'variabel'}`}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                className="min-w-0 flex-1 rounded-md border-0 bg-slate-800 px-2 py-1 font-mono text-base text-white ring-1 ring-slate-600 sm:text-sm"
              />
              <Button size="sm" type="submit">
                Kirim
              </Button>
            </form>
          )}
        </div>
        <div className="rounded-lg ring-1 ring-slate-200">
          <p className="rounded-t-lg bg-slate-100 px-3 py-1 text-xs font-bold tracking-wide text-slate-600">
            PANTAU VARIABEL
          </p>
          <table className="w-full text-[0.85em]">
            <tbody>
              {vars.length === 0 && (
                <tr>
                  <td className="px-3 py-2 text-slate-400">belum ada variabel</td>
                </tr>
              )}
              {vars.map((v) => (
                <tr key={v.name} className="border-t border-slate-100">
                  <td className="px-3 py-1 font-semibold">{v.name}</td>
                  <td className="px-1 py-1 text-xs text-slate-500">{v.type}</td>
                  <td className="px-3 py-1 font-mono break-all">{v.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {checks && (
        <TestResults rows={examples.map((example, i) => ({ ...example, ...checks[i] }))} local />
      )}
    </div>
  )
}

/** Tabel hasil uji (dari server atau "Coba contoh uji" di browser). Uji tersembunyi hanya benar/salah. */
export function TestResults({ rows, local = false }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[0.85em] font-semibold text-slate-700">
        {local ? 'Hasil contoh uji (di HP/laptopmu):' : 'Hasil pemeriksaan:'}
      </p>
      {rows.map((row, i) => (
        <div
          key={i}
          className={`rounded-lg p-2 text-[0.85em] ring-1 ${row.ok ? 'bg-brand-50 ring-brand-200' : 'bg-red-50 ring-red-200'}`}
        >
          <p className="flex items-center gap-1.5 font-semibold">
            {row.ok ? (
              <CircleCheck className="size-4 text-brand-700" aria-hidden="true" />
            ) : (
              <CircleX className="size-4 text-red-600" aria-hidden="true" />
            )}
            Uji {i + 1}
            {row.hidden ? ' (tersembunyi)' : ''}: {row.ok ? 'benar' : 'belum tepat'}
            {!row.hidden && row.inputs?.length > 0 && (
              <span className="font-normal text-slate-600">— isian: {row.inputs.join(', ')}</span>
            )}
          </p>
          {!row.ok && !row.hidden && (
            <div className="mt-1 space-y-0.5 font-mono text-[0.95em]">
              <p>Seharusnya berakhir dengan: {row.expected.join(' | ')}</p>
              <p>
                Programmu:{' '}
                {row.error
                  ? `galat: ${row.error}`
                  : row.out?.length
                    ? row.out.join(' | ')
                    : '(tidak ada)'}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
