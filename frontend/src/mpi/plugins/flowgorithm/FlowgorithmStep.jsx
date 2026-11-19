import { useMemo, useState } from 'react'
import FlowchartDiagram from '../../../components/code/FlowchartDiagram'
import { Rich, StepImage } from '../../steps/ExplainSteps'
import { ChoiceStep } from '../../steps/PracticeSteps'
import FlowgorithmEditor from './FlowgorithmEditor'
import { blankIndexes, fillBlanks, toDiagram, withIds } from './program'
import ProgramRunner, { TestResults } from './ProgramRunner'

function ViewTabs({ view, setView }) {
  const tab = (id, label) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === id}
      onClick={() => setView(id)}
      className={`rounded-md px-3 py-1.5 text-[0.85em] font-semibold ${
        view === id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-600'
      }`}
    >
      {label}
    </button>
  )
  return (
    <div role="tablist" className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
      {tab('blocks', 'Blok program')}
      {tab('chart', 'Flowchart')}
    </div>
  )
}

function Examples({ examples, hidden }) {
  if (!examples?.length) return null
  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
      <table className="w-full text-[0.85em]">
        <thead className="bg-slate-50 text-left text-slate-600">
          <tr>
            <th className="px-3 py-1.5">Contoh isian</th>
            <th className="px-3 py-1.5">Output akhir yang diharapkan</th>
          </tr>
        </thead>
        <tbody>
          {examples.map((example, i) => (
            <tr key={i} className="border-t border-slate-100 align-top">
              <td className="px-3 py-1.5 font-mono">
                {example.inputs.join(', ') || '(tanpa isian)'}
              </td>
              <td className="px-3 py-1.5 font-mono whitespace-pre-line">
                {example.expected.join('\n')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hidden > 0 && (
        <p className="border-t border-slate-100 px-3 py-1.5 text-[0.8em] text-slate-500">
          + {hidden} uji tersembunyi dengan isian lain. Pastikan programmu benar untuk semua isian.
        </p>
      )}
    </div>
  )
}

function Workspace({ program, runnable, editor, examples, compare, inputs }) {
  const [view, setView] = useState('blocks')
  const [marks, setMarks] = useState({ active: null, error: null })
  return (
    <div className="space-y-3">
      <ViewTabs view={view} setView={setView} />
      {view === 'blocks' ? (
        editor({ activeId: marks.active, errorId: marks.error })
      ) : (
        <FlowchartDiagram
          fit
          program={{ blocks: toDiagram(runnable.body) }}
          activeId={marks.active}
          highlightId={marks.error}
          title="Flowchart program"
        />
      )}
      <ProgramRunner
        key={JSON.stringify(program)}
        program={runnable}
        examples={examples}
        compare={compare}
        inputs={inputs}
        onMark={setMarks}
      />
    </div>
  )
}

/**
 * Latihan Flowgorithm. Mode "build": siswa menyusun program (nilai = { program }); mode "fill": siswa mengisi
 * bagian kosong (nilai = { blanks }). Program boleh dicoba sepuasnya di browser; nilai dihitung di server.
 */
export function FlowgorithmStep({ step, user, value, onChange, review }) {
  const base = useMemo(() => withIds(step.program), [step.program])
  const fill = step.mode === 'fill'
  const blanks = fill ? (value?.blanks ?? Array.from({ length: step.blanks }, () => '')) : null
  const program = fill ? base : (value?.program ?? base)
  const runnable = fill ? fillBlanks(base, blanks) : program
  const indexes = useMemo(() => blankIndexes(base), [base])
  const results = Array.isArray(review?.result) ? review.result : null

  const editor = (marks) => (
    <FlowgorithmEditor
      program={program}
      onChange={!fill && onChange ? (next) => onChange({ program: next }) : null}
      blanks={
        fill
          ? {
              indexes,
              values: blanks,
              onChange: onChange
                ? (index, text) =>
                    onChange({ blanks: blanks.map((b, i) => (i === index ? text : b)) })
                : null,
            }
          : undefined
      }
      {...marks}
    />
  )

  return (
    <div className="space-y-4">
      <Rich text={step.text} user={user} />
      {step.image && <StepImage src={step.image} className="max-h-72" />}
      <Examples examples={step.examples} hidden={step.hidden_tests} />
      {fill ? (
        <p className="rounded-lg bg-yellow-50 p-2 text-[0.85em] text-yellow-900 ring-1 ring-yellow-200">
          Isi kotak kuning ({step.blanks} bagian kosong), lalu tekan Jalankan untuk mencoba.
        </p>
      ) : (
        <p className="text-[0.85em] text-slate-600">
          Susun blok programmu. Tekan <strong>Jalankan</strong> untuk mencoba sendiri, lalu{' '}
          <strong>Periksa</strong> jika sudah yakin.
        </p>
      )}
      <Workspace
        program={program}
        runnable={runnable}
        editor={editor}
        examples={step.examples}
        compare={step.compare}
      />
      {results && <TestResults rows={results} />}
      {review?.key?.program && (
        <details className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
          <summary className="cursor-pointer text-[0.9em] font-semibold text-slate-700">
            Program kunci
          </summary>
          <div className="mt-2">
            <FlowgorithmEditor program={withIds(review.key.program)} />
          </div>
        </details>
      )}
      {review?.key?.blanks && (
        <p className="rounded-lg bg-brand-50 p-2 text-[0.9em] ring-1 ring-brand-200">
          Jawaban bagian kosong:{' '}
          {review.key.blanks.map((answer, i) => (
            <span key={i} className="me-2 font-mono">
              ({i + 1}) {answer}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

/** Demo/lab: program contoh yang bisa dijalankan & dilangkahi (dan diubah jika `editable`), tanpa nilai. */
export function FlowgorithmDemoStep({ step, user }) {
  const base = useMemo(() => withIds(step.program), [step.program])
  const [program, setProgram] = useState(base)
  const changed = program !== base
  return (
    <div className="space-y-4">
      <Rich text={step.body} user={user} />
      <Workspace
        program={program}
        runnable={program}
        inputs={step.inputs}
        editor={(marks) => (
          <FlowgorithmEditor
            program={program}
            onChange={step.editable ? setProgram : null}
            {...marks}
          />
        )}
      />
      {changed && (
        <button
          type="button"
          onClick={() => setProgram(base)}
          className="text-[0.85em] font-semibold text-brand-700 underline"
        >
          Kembalikan program awal
        </button>
      )}
    </div>
  )
}

/** Tebak output: program hanya ditampilkan (tidak bisa dijalankan), siswa memilih output yang benar. */
export function FlowgorithmPredictStep({ step, user, value, onChange, review }) {
  const program = useMemo(() => withIds(step.program), [step.program])
  const [view, setView] = useState('chart')
  return (
    <div className="space-y-4">
      <ViewTabs view={view} setView={setView} />
      {view === 'chart' ? (
        <FlowchartDiagram
          fit
          program={{ blocks: toDiagram(program.body) }}
          title="Flowchart program"
        />
      ) : (
        <FlowgorithmEditor program={program} />
      )}
      {step.inputs?.length > 0 && (
        <p className="text-[0.9em]">
          <strong>Isian yang diketik:</strong>{' '}
          {step.inputs.map((input, i) => (
            <code key={i} className="me-1 rounded bg-slate-100 px-1.5 py-0.5">
              {input}
            </code>
          ))}
        </p>
      )}
      <ChoiceStep step={step} user={user} value={value} onChange={onChange} review={review} />
    </div>
  )
}
