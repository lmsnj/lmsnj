import { Calculator, Copy, FileCode } from 'lucide-react'
import { useRef, useState } from 'react'
import { learningMediaApi } from '../../../api/learningMedia'
import Button from '../../../components/Button'
import SelectField from '../../../components/SelectField'
import TextAreaField from '../../../components/TextAreaField'
import { getErrorMessage } from '../../../utils/errors'
import { CheckField, ImageField, LinesField, ListEditor } from '../../studio/fields'
import FlowgorithmEditor from './FlowgorithmEditor'
import { formatValue, runProgram } from './interpreter'
import { countBlanks, fillBlanks, withIds } from './program'

const FORMAT_HINT = 'Boleh **tebal**, *miring*, rumus $...$, dan {nama_panggilan}.'

/** Tombol impor file Flowgorithm asli (.fprg) menjadi program. */
function FprgButton({ onLoaded, label = 'Impor .fprg' }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const load = async (file) => {
    if (!file) return
    setBusy(true)
    setMessage('')
    try {
      const { program, warnings } = await learningMediaApi.fprg(file)
      onLoaded(withIds(program))
      setMessage(warnings.length ? warnings.join(' ') : `Program dari ${file.name} dimuat.`)
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        loading={busy}
        onClick={() => inputRef.current?.click()}
      >
        <FileCode className="size-4" aria-hidden="true" /> {label}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".fprg"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => load(event.target.files?.[0])}
      />
      {message && <span className="text-xs text-slate-600">{message}</span>}
    </span>
  )
}

function ProgramBox({ title, hint, program, onChange, extra }) {
  return (
    <fieldset className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
      <legend className="px-1 text-sm font-semibold text-slate-800">{title}</legend>
      {hint && <p className="text-xs text-slate-600">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        <FprgButton onLoaded={onChange} />
        {extra}
      </div>
      <FlowgorithmEditor program={withIds(program ?? { body: [] })} onChange={onChange} functions />
    </fieldset>
  )
}

/** Form Studio jenis langkah `flowgorithm` (susun program / isi bagian kosong). */
export function FlowgorithmFields({ step, set, mediaId }) {
  const [version, setVersion] = useState(0)
  const [computeError, setComputeError] = useState('')
  const fill = step.mode === 'fill'
  const blanks = countBlanks(step.program ?? { body: [] })
  const reference = fill
    ? fillBlanks(step.program ?? { body: [] }, step.answers ?? [])
    : step.solution
  const hasReference = fill
    ? (step.answers ?? []).length === blanks && blanks > 0
    : reference?.body?.length > 0

  const compute = () => {
    setComputeError('')
    const errors = []
    const tests = (step.tests ?? []).map((test, i) => {
      const result = runProgram(reference, test.inputs ?? [])
      if (result.error) errors.push(`Uji ${i + 1}: ${result.error}`)
      return result.error ? test : { ...test, expected: result.out }
    })
    set({ tests })
    setVersion((v) => v + 1)
    if (errors.length) setComputeError(errors.join(' '))
  }

  return (
    <>
      <SelectField
        label="Mode latihan"
        value={step.mode ?? 'build'}
        onChange={(event) => set({ mode: event.target.value })}
        options={[
          { value: 'build', label: 'Susun program (studi kasus)' },
          { value: 'fill', label: 'Isi bagian kosong {{}} di program yang sudah jadi' },
        ]}
      />
      <TextAreaField
        label="Soal / perintah"
        value={step.text ?? ''}
        rows={3}
        hint={FORMAT_HINT}
        onChange={(event) => set({ text: event.target.value })}
      />
      <ImageField value={step.image} onChange={(image) => set({ image })} mediaId={mediaId} />
      <ProgramBox
        title={fill ? 'Program dengan bagian kosong' : 'Program awal (dilihat siswa)'}
        hint={
          fill
            ? `Tulis {{}} di isian blok yang harus dilengkapi siswa. Sekarang: ${blanks} bagian kosong.`
            : 'Boleh kosong, atau berisi Declare/Input sebagai awalan untuk siswa.'
        }
        program={step.program}
        onChange={(program) => set({ program })}
      />
      {fill ? (
        <LinesField
          key={`answers-${step.id}`}
          label={`Jawaban bagian kosong (satu per baris, berurutan; ${blanks} baris)`}
          value={step.answers ?? []}
          onChange={(answers) => set({ answers })}
          rows={Math.max(2, blanks)}
        />
      ) : (
        <ProgramBox
          title="Program kunci (tidak dikirim ke siswa)"
          hint="Dipakai menghitung output yang diharapkan dan ditampilkan saat siswa membuka jawaban."
          program={step.solution}
          onChange={(solution) => set({ solution })}
          extra={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => set({ solution: structuredClone(step.program) })}
            >
              <Copy className="size-4" aria-hidden="true" /> Salin dari program awal
            </Button>
          }
        />
      )}
      <ListEditor
        key={`tests-${version}`}
        label="Uji (isian → output yang diharapkan)"
        items={step.tests ?? []}
        min={1}
        max={10}
        onChange={(tests) => set({ tests })}
        newItem={() => ({ inputs: [], expected: [], hidden: false })}
        addLabel="Tambah uji"
        renderItem={(test, update) => (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <LinesField
                label="Isian (satu per baris)"
                value={test.inputs ?? []}
                onChange={(inputs) => update({ inputs })}
                rows={2}
              />
              <LinesField
                label="Output akhir yang diharapkan"
                value={test.expected ?? []}
                onChange={(expected) => update({ expected })}
                rows={2}
                hint={
                  hasReference ? 'Kosong = dihitung dari program kunci saat disimpan.' : undefined
                }
              />
            </div>
            <CheckField
              label="Tersembunyi (hanya dinilai di server, isiannya tidak dilihat siswa)"
              checked={test.hidden}
              onChange={(hidden) => update({ hidden })}
            />
          </>
        )}
      />
      {hasReference && (
        <div className="space-y-1">
          <Button variant="secondary" size="sm" onClick={compute}>
            <Calculator className="size-4" aria-hidden="true" /> Hitung output dari program kunci
          </Button>
          {computeError && <p className="text-xs text-red-600">{computeError}</p>}
        </div>
      )}
      <SelectField
        label="Cara membandingkan output"
        value={step.compare ?? 'tail'}
        onChange={(event) => set({ compare: event.target.value })}
        options={[
          {
            value: 'tail',
            label: 'Baris terakhir harus sama (pertanyaan seperti "Panjang?" boleh tampil)',
          },
          { value: 'exact', label: 'Seluruh output harus sama persis' },
        ]}
      />
      <TextAreaField
        label="Pembahasan (tampil setelah siswa benar / membuka jawaban)"
        value={step.explanation ?? ''}
        rows={2}
        onChange={(event) => set({ explanation: event.target.value })}
      />
    </>
  )
}

/** Form Studio jenis langkah `flowgorithm_demo` (program contoh / lab). */
export function FlowgorithmDemoFields({ step, set }) {
  return (
    <>
      <TextAreaField
        label="Keterangan / tugas"
        value={step.body ?? ''}
        rows={3}
        hint={FORMAT_HINT}
        onChange={(event) => set({ body: event.target.value })}
      />
      <ProgramBox title="Program" program={step.program} onChange={(program) => set({ program })} />
      <LinesField
        key={`inputs-${step.id}`}
        label="Contoh isian untuk dicoba siswa (opsional, satu per baris)"
        value={step.inputs ?? []}
        onChange={(inputs) => set({ inputs })}
        rows={2}
      />
      <CheckField
        label="Siswa boleh mengubah program (lab bebas)"
        checked={step.editable}
        onChange={(editable) => set({ editable })}
      />
    </>
  )
}

/** Jawaban benar tebak output (sama dengan backend `predicted_output`). */
function predicted(program, inputs, show) {
  const result = runProgram(program ?? { body: [] }, inputs ?? [])
  if (result.error) return `Error: ${result.error}`
  if (!result.out.length) return 'Tidak ada yang tampil'
  return show === 'last' ? result.out.at(-1) : result.out.join(', ')
}

/** Form Studio jenis langkah `flowgorithm_predict` (tebak output). */
export function FlowgorithmPredictFields({ step, set }) {
  const answer = predicted(step.program, step.inputs, step.show)
  return (
    <>
      <TextAreaField
        label="Pertanyaan"
        value={step.text ?? ''}
        rows={2}
        hint={FORMAT_HINT}
        onChange={(event) => set({ text: event.target.value })}
      />
      <ProgramBox
        title="Program yang ditampilkan"
        program={step.program}
        onChange={(program) => set({ program })}
      />
      <LinesField
        key={`inputs-${step.id}`}
        label="Isian yang diketik (opsional, satu per baris)"
        value={step.inputs ?? []}
        onChange={(inputs) => set({ inputs })}
        rows={2}
      />
      <SelectField
        label="Yang ditebak siswa"
        value={step.show ?? 'all'}
        onChange={(event) => set({ show: event.target.value })}
        options={[
          { value: 'all', label: 'Semua output (digabung dengan koma)' },
          { value: 'last', label: 'Baris output terakhir saja' },
        ]}
      />
      <p className="rounded-lg bg-brand-50 p-2 text-sm ring-1 ring-brand-200">
        Jawaban benar (dihitung otomatis):{' '}
        <span className="font-mono font-semibold">{formatValue(answer)}</span>
      </p>
      <LinesField
        key={`wrong-${step.id}`}
        label="Pilihan salah (1-5, satu per baris)"
        value={step.wrong ?? []}
        onChange={(wrong) => set({ wrong })}
        rows={3}
      />
      <TextAreaField
        label="Pembahasan (tampil setelah siswa benar / membuka jawaban)"
        value={step.explanation ?? ''}
        rows={2}
        onChange={(event) => set({ explanation: event.target.value })}
      />
    </>
  )
}
