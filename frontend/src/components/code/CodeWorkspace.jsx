import { CheckCircle2, Play, RotateCcw, ShieldCheck, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { codeExercisesApi } from '../../api/materials'
import {
  buildSrcdoc,
  checkLabel,
  INPUT_HINTS,
  normalizeOutput,
  outputMatches,
  summarizeResults,
} from '../../utils/codePractice'
import { getErrorMessage } from '../../utils/errors'
import Alert from '../Alert'
import Button from '../Button'
import RichText from '../RichText'
import CodeEditor from './CodeEditor'
import { LANGUAGE_NAMES, runCode } from './workerRunner'

const CHECK_TIMEOUT = 8000

/**
 * Area kerja satu soal Praktik: petunjuk, editor, tombol Jalankan & Periksa, hasil pemeriksaan.
 * HTML/CSS/JS dijalankan di iframe sandbox (tanpa akses ke LMS), Python & PHP di Web Worker.
 * `preview` = guru mencoba (tidak disimpan). Siswa: kode disimpan setiap Jalankan/Periksa, lalu
 * `onSaved({ attempt, material })` dipanggil. `initialCode`/`onCodeChange` = draf yang tetap ada saat
 * pindah soal.
 */
export default function CodeWorkspace({
  exercise,
  preview = false,
  initialCode,
  initialPassed,
  onCodeChange,
  onSaved,
}) {
  const isHtml = exercise.language === 'html'
  const engine = LANGUAGE_NAMES[exercise.language]
  const [code, setCodeState] = useState(
    initialCode ?? (exercise.my_attempt?.code || exercise.starter_code || ''),
  )
  const setCode = (value) => {
    setCodeState(value)
    onCodeChange?.(value)
  }
  const [stdin, setStdin] = useState('')
  const [output, setOutput] = useState(null) // Python: { text, error }
  const [logs, setLogs] = useState([]) // HTML: console.log & error
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(null) // null | 'run' | 'check'
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [passed, setPassed] = useState(Boolean(initialPassed ?? exercise.my_attempt?.passed))

  // HTML: iframe pratinjau dibuat ulang setiap kali dijalankan (key) agar mulai dari awal.
  const frame = useRef(null)
  const [frameDoc, setFrameDoc] = useState(null)
  const [frameKey, setFrameKey] = useState(0)
  const waiters = useRef({})

  useEffect(() => {
    const onMessage = (event) => {
      // Hanya pesan dari iframe pratinjau milik soal ini.
      if (!frame.current || event.source !== frame.current.contentWindow) return
      const data = event.data
      if (data?.source !== 'lms-run') return
      if (data.kind === 'log') setLogs((list) => [...list.slice(-199), data])
      else waiters.current[data.kind]?.(data)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const waitFor = (kind) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        delete waiters.current[kind]
        reject(
          new Error('Halaman tidak merespons. Periksa perulangan JavaScript yang tidak berhenti.'),
        )
      }, CHECK_TIMEOUT)
      waiters.current[kind] = (data) => {
        clearTimeout(timer)
        delete waiters.current[kind]
        resolve(data)
      }
    })

  const loadFrame = async () => {
    setLogs([])
    const ready = waitFor('ready')
    setFrameDoc(buildSrcdoc(code))
    setFrameKey((key) => key + 1)
    await ready
  }

  const save = async (checked, allPassed) => {
    if (preview) return
    const data = await codeExercisesApi.attempt(exercise.id, { code, checked, passed: allPassed })
    if (data.attempt.passed) setPassed(true)
    onSaved?.(data)
  }

  const run = async () => {
    setBusy('run')
    setError('')
    setResults(null)
    try {
      if (isHtml) {
        await loadFrame()
      } else {
        const [result] = await runCode(
          exercise.language,
          code,
          [{ input: stdin, showPrompt: true }],
          {
            onStatus: (s) => setStatus(s === 'loading' ? `Menyiapkan ${engine}…` : 'Menjalankan…'),
          },
        )
        setOutput({ text: result.output, error: result.error })
      }
      await save(false, false)
    } catch (err) {
      setError(err.message ?? getErrorMessage(err))
    } finally {
      setBusy(null)
      setStatus('')
    }
  }

  const check = async () => {
    setBusy('check')
    setError('')
    try {
      let checked
      if (isHtml) {
        await loadFrame()
        const answer = waitFor('results')
        frame.current.contentWindow.postMessage(
          { source: 'lms-parent', checks: exercise.checks },
          '*',
        )
        checked = (await answer).results
      } else {
        const runs = exercise.checks.map((c) => ({ input: c.input, showPrompt: false }))
        const outputs = await runCode(exercise.language, code, runs, {
          onStatus: (s) => setStatus(s === 'loading' ? `Menyiapkan ${engine}…` : 'Memeriksa…'),
        })
        checked = outputs.map((out, index) => {
          const expected = exercise.checks[index].output
          if (out.error) return { ok: false, detail: out.error }
          const ok = outputMatches(out.output, expected)
          const shown = normalizeOutput(out.output) || '(tidak ada keluaran)'
          return { ok, detail: ok ? '' : `Keluaran programmu: “${shown.slice(0, 300)}”` }
        })
      }
      setResults(checked)
      await save(true, summarizeResults(checked).done)
    } catch (err) {
      setError(err.message ?? getErrorMessage(err))
    } finally {
      setBusy(null)
      setStatus('')
    }
  }

  const summary = results && summarizeResults(results)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900">{exercise.title}</h3>
          {exercise.instructions && (
            <RichText
              text={exercise.instructions}
              className="mt-1 text-sm whitespace-pre-line text-slate-700"
            />
          )}
        </div>
        {passed && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-800">
            <CheckCircle2 className="size-3.5" aria-hidden="true" /> Lulus
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Kode</span>
            <button
              type="button"
              onClick={() => setCode(exercise.starter_code || '')}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" /> Atur ulang
            </button>
          </div>
          <CodeEditor
            key={exercise.id}
            value={code}
            onChange={setCode}
            language={exercise.language}
            minHeight="18rem"
          />
        </div>

        <div className="min-w-0 space-y-2">
          {isHtml ? (
            <>
              <span className="text-sm font-medium text-slate-700">Hasil</span>
              <div className="h-72 overflow-hidden rounded-lg bg-white ring-1 ring-slate-300">
                {frameDoc ? (
                  <iframe
                    key={frameKey}
                    ref={frame}
                    title={`Hasil ${exercise.title}`}
                    srcDoc={frameDoc}
                    // Tanpa allow-same-origin: kode siswa tidak bisa membaca data/token LMS.
                    sandbox="allow-scripts allow-modals"
                    className="size-full"
                  />
                ) : (
                  <p className="p-4 text-sm text-slate-500">Klik “Jalankan” untuk melihat hasil.</p>
                )}
              </div>
              <ConsoleBox lines={logs.map((l) => ({ text: l.text, error: l.level === 'error' }))} />
            </>
          ) : (
            <>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor={`stdin-${exercise.id}`}
              >
                Masukan untuk <code>{INPUT_HINTS[exercise.language]}</code>{' '}
                <span className="font-normal text-slate-500">(satu baris = satu input)</span>
              </label>
              <textarea
                id={`stdin-${exercise.id}`}
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                rows={3}
                className="block w-full rounded-lg px-3 py-2 font-mono text-base ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-500 focus:outline-none sm:text-sm"
              />
              <ConsoleBox
                title="Keluaran"
                lines={
                  output
                    ? [
                        ...(output.text ? [{ text: output.text }] : []),
                        ...(output.error ? [{ text: output.error, error: true }] : []),
                      ]
                    : []
                }
                empty={output ? '(tidak ada keluaran)' : 'Klik “Jalankan” untuk melihat keluaran.'}
              />
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={run} loading={busy === 'run'} disabled={Boolean(busy)}>
          <Play className="size-4" aria-hidden="true" /> Jalankan
        </Button>
        <Button onClick={check} loading={busy === 'check'} disabled={Boolean(busy)}>
          <ShieldCheck className="size-4" aria-hidden="true" /> Periksa
        </Button>
        {status && <span className="text-sm text-slate-500">{status}</span>}
        {preview && <span className="text-xs text-slate-500">Mode coba: tidak disimpan.</span>}
      </div>
      <Alert type="error">{error}</Alert>

      <div>
        <p className="text-sm font-medium text-slate-700">
          Pemeriksaan{' '}
          {summary && (
            <span className={summary.done ? 'text-brand-700' : 'text-red-600'}>
              ({summary.passed}/{summary.total} lulus)
            </span>
          )}
        </p>
        <ul className="mt-2 space-y-1.5">
          {exercise.checks.map((item, index) => {
            const result = results?.[index]
            return (
              <li key={index} className="flex items-start gap-2 text-sm">
                {result ? (
                  result.ok ? (
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-brand-600"
                      aria-label="Lulus"
                    />
                  ) : (
                    <XCircle
                      className="mt-0.5 size-4 shrink-0 text-red-500"
                      aria-label="Belum lulus"
                    />
                  )
                ) : (
                  <span
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-slate-300"
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0">
                  <span className="text-slate-800">{checkLabel(item, exercise.language)}</span>
                  {result && !result.ok && result.detail && (
                    <span className="block text-xs break-words whitespace-pre-wrap text-red-600">
                      {result.detail}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
        {summary?.done && (
          <p className="mt-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-800">
            Hebat! Semua pemeriksaan lulus
            {preview ? ' (mode coba).' : '. Pekerjaanmu sudah tersimpan.'}
          </p>
        )}
      </div>
    </div>
  )
}

function ConsoleBox({ title = 'Console', lines, empty = 'Belum ada keluaran console.' }) {
  return (
    <div>
      <span className="text-xs font-medium text-slate-500">{title}</span>
      <pre className="mt-1 max-h-48 min-h-16 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs whitespace-pre-wrap text-slate-100">
        {lines.length ? (
          lines.map((line, index) => (
            <span key={index} className={`block ${line.error ? 'text-red-300' : ''}`}>
              {line.text}
            </span>
          ))
        ) : (
          <span className="text-slate-400">{empty}</span>
        )}
      </pre>
    </div>
  )
}
