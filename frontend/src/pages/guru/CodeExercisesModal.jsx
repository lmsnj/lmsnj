import { ArrowLeft, Code2, Eye, FileSpreadsheet, Plus, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { codeExercisesApi, materialsApi } from '../../api/materials'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import CodeEditor from '../../components/code/CodeEditor'
import CodeWorkspace from '../../components/code/CodeWorkspace'
import FlowchartDiagram from '../../components/code/FlowchartDiagram'
import FlowchartEditor from '../../components/code/FlowchartEditor'
import MathWorkspace from '../../components/code/MathWorkspace'
import DeleteDialog from '../../components/DeleteDialog'
import Modal from '../../components/Modal'
import SelectField from '../../components/SelectField'
import Spinner from '../../components/Spinner'
import TemplatePicker from '../../components/TemplatePicker'
import TextAreaField from '../../components/TextAreaField'
import TextField from '../../components/TextField'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'
import {
  checkLabel,
  checkProblem,
  emptyCheck,
  EXERCISE_TEMPLATES,
  FIELD_LABELS,
  FIELD_PLACEHOLDERS,
  HTML_CHECK_TYPES,
  INPUT_HINTS,
  isIoLanguage,
  LANGUAGE_LABELS,
  LANGUAGES,
  missingVariables,
  OUTPUT_HINTS,
  rowsToVariables,
  variablesToRows,
} from '../../utils/codePractice'
import { parseProgram } from '../../utils/flowchart/program'
import { formatDate } from '../../utils/media'
import QuizImportModal from './QuizImportModal'

const MAX_EXERCISES = 5

/**
 * Praktik satu materi untuk guru: daftar soal (kode atau Matematika), tambah/ubah (pemeriksaan
 * otomatis), coba sebagai siswa, dan lihat kode/jawaban setiap siswa. `onChanged()` dipanggil setelah soal berubah.
 */
export default function CodeExercisesModal({ material, onClose, onChanged }) {
  const exercises = useFetch(codeExercisesApi.list, material.id)
  // { mode: 'list' | 'form' | 'preview' | 'results' | 'import', exercise }
  const [view, setView] = useState({ mode: 'list' })
  const [deleting, setDeleting] = useState(null)
  const [notice, setNotice] = useState('')
  const list = exercises.data ?? []
  const back = () => setView({ mode: 'list' })

  if (view.mode === 'import') {
    return (
      <QuizImportModal
        title={`Impor Soal Praktik: ${material.title}`}
        templateFilename={`Praktik - ${material.title}.xlsx`}
        fetchTemplate={() => materialsApi.codeTemplate(material.id)}
        importFile={(file, dryRun) => materialsApi.importCode(material.id, file, dryRun)}
        hint="Judul sama = soal diganti; judul baru = soal baru (maks. 5 soal per materi)."
        kindLabel="Bahasa"
        textLabel="Judul / Lembar"
        onClose={back}
        onImported={(count) => {
          setNotice(`${count} soal Praktik diimpor dari Excel.`)
          exercises.reload()
          onChanged?.()
          back()
        }}
      >
        <p className="text-slate-600">
          Tulis banyak soal Praktik sekaligus di Excel: lembar <strong>Soal</strong> (judul, bahasa,
          petunjuk, kode awal) dan pemeriksaannya di lembar <strong>Cek Program</strong>,{' '}
          <strong>Cek HTML</strong>, <strong>Soal Matematika</strong>, dan <strong>Variabel</strong>
          . Template berisi soal yang sudah ada (atau contoh jika belum ada).
        </p>
        <p className="rounded-lg bg-slate-50 p-3 text-slate-700 ring-1 ring-slate-200">
          Flowchart awal tidak bisa ditulis di Excel; flowchart awal soal yang sudah ada tetap
          dipakai.
        </p>
      </QuizImportModal>
    )
  }

  const titles = {
    list: `Praktik: ${material.title}`,
    form: view.exercise ? 'Ubah Soal Praktik' : 'Tambah Soal Praktik',
    preview: `Coba: ${view.exercise?.title}`,
    results: `Pekerjaan Siswa: ${view.exercise?.title}`,
  }

  return (
    <Modal
      open
      size="xl"
      title={titles[view.mode]}
      onClose={onClose}
      footer={
        view.mode === 'list' ? (
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
        ) : view.mode === 'form' ? null : (
          <Button variant="secondary" onClick={back}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Kembali
          </Button>
        )
      }
    >
      {view.mode === 'list' && (
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            Siswa mengerjakan Praktik setelah membuka semua konten dan lulus Latihan Pemahaman (jika
            ada). Semua soal harus lulus pemeriksaan otomatis sebelum siswa menulis Cerita
            Reflektif. Kode dijalankan di browser siswa; Anda bisa membaca kode setiap siswa.
          </p>
          <Alert type="success">{notice}</Alert>
          <Alert type="error">{exercises.error}</Alert>
          {exercises.loading && !list.length ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : list.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-4 text-slate-500 ring-1 ring-slate-200">
              Belum ada soal praktik. Klik “Tambah Soal”.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
              {list.map((exercise, index) => (
                <li key={exercise.id} className="flex flex-wrap items-center gap-3 p-3">
                  <Code2 className="size-5 shrink-0 text-brand-600" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">
                      {index + 1}. {exercise.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {LANGUAGE_LABELS[exercise.language]} • {exercise.checks.length}{' '}
                      {exercise.language === 'math' ? 'soal' : 'pemeriksaan'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setView({ mode: 'preview', exercise })}
                    >
                      <Eye className="size-4" aria-hidden="true" /> Coba
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setView({ mode: 'results', exercise })}
                    >
                      <Users className="size-4" aria-hidden="true" /> Pekerjaan Siswa
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setView({ mode: 'form', exercise })}
                    >
                      Ubah
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      aria-label={`Hapus ${exercise.title}`}
                      onClick={() => setDeleting(exercise)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setView({ mode: 'form', exercise: null })}
              disabled={list.length >= MAX_EXERCISES}
            >
              <Plus className="size-4" aria-hidden="true" /> Tambah Soal
            </Button>
            <Button variant="secondary" onClick={() => setView({ mode: 'import' })}>
              <FileSpreadsheet className="size-4" aria-hidden="true" /> Impor Excel
            </Button>
          </div>
          {list.length >= MAX_EXERCISES && (
            <p className="text-xs text-slate-500">Maksimal {MAX_EXERCISES} soal per materi.</p>
          )}
        </div>
      )}

      {view.mode === 'form' && (
        <ExerciseForm
          material={material}
          exercise={view.exercise}
          onCancel={back}
          onSaved={(saved, isEdit) => {
            setNotice(`Soal "${saved.title}" ${isEdit ? 'diperbarui' : 'ditambahkan'}.`)
            exercises.reload()
            onChanged?.()
            back()
          }}
        />
      )}

      {view.mode === 'preview' &&
        (view.exercise.language === 'math' ? (
          <MathWorkspace exercise={view.exercise} preview />
        ) : (
          <CodeWorkspace exercise={view.exercise} preview />
        ))}

      {view.mode === 'results' && <StudentWork exercise={view.exercise} />}

      <DeleteDialog
        item={deleting}
        title="Hapus Soal Praktik"
        message={(e) => `Hapus soal "${e.title}"? Pekerjaan siswa pada soal ini juga terhapus.`}
        onDelete={(e) => codeExercisesApi.remove(e.id)}
        onDeleted={(e) => {
          setNotice(`Soal "${e.title}" dihapus.`)
          exercises.reload()
          onChanged?.()
        }}
        onClose={() => setDeleting(null)}
      />
    </Modal>
  )
}

function ExerciseForm({ material, exercise, onCancel, onSaved }) {
  const [values, setValues] = useState(() => ({
    title: exercise?.title ?? '',
    language: exercise?.language ?? 'python',
    instructions: exercise?.instructions ?? '',
    starter_code: exercise?.starter_code ?? '',
    checks: exercise?.checks?.length ? exercise.checks : [emptyCheck('python')],
  }))
  // Matematika: daftar variabel angka acak [{name, min, max, step}].
  const [variableRows, setVariableRows] = useState(() => variablesToRows(exercise?.variables))
  const [problem, setProblem] = useState('')
  const isMath = values.language === 'math'
  const set = (field, value) => setValues((v) => ({ ...v, [field]: value }))
  const setCheck = (index, changes) =>
    set(
      'checks',
      values.checks.map((check, i) => (i === index ? { ...check, ...changes } : check)),
    )

  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const payload = { ...values, variables: isMath ? rowsToVariables(variableRows) : {} }
    const saved = exercise
      ? await codeExercisesApi.update(exercise.id, payload)
      : await codeExercisesApi.create({ ...payload, material: material.id })
    onSaved(saved, Boolean(exercise))
  })

  const onSubmit = (event) => {
    event.preventDefault()
    const index = values.checks.findIndex((check) => checkProblem(check, values.language))
    if (index >= 0) {
      const label = isMath ? 'Soal' : 'Pemeriksaan'
      setProblem(`${label} ${index + 1}: ${checkProblem(values.checks[index], values.language)}`)
      return
    }
    const missing = isMath ? missingVariables(values.checks, variableRows) : []
    if (missing.length) {
      setProblem(
        `Variabel ${missing.map((m) => `[${m}]`).join(', ')} dipakai di soal tetapi belum dibuat di daftar variabel.`,
      )
      return
    }
    setProblem('')
    submit()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex justify-end">
        <TemplatePicker
          templates={EXERCISE_TEMPLATES}
          onPick={(picked) => {
            const { variables, ...rest } = picked
            setValues(rest)
            setVariableRows(variablesToRows(variables))
          }}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <TextField
          label="Judul soal"
          required
          maxLength={200}
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          error={errors.title}
        />
        <SelectField
          label="Bahasa"
          options={LANGUAGES}
          value={values.language}
          onChange={(e) =>
            setValues((v) => {
              // Kode awal teks tidak berlaku untuk flowchart/matematika (dan sebaliknya).
              const special = (lang) => lang === 'flowchart' || lang === 'math'
              const keepStarter = !special(v.language) && !special(e.target.value)
              return {
                ...v,
                language: e.target.value,
                starter_code: keepStarter ? v.starter_code : '',
                checks: [emptyCheck(e.target.value)],
              }
            })
          }
          error={errors.language}
        />
      </div>
      <TextAreaField
        label="Petunjuk untuk siswa"
        rows={3}
        value={values.instructions}
        onChange={(e) => set('instructions', e.target.value)}
        hint="Jelaskan apa yang harus dibuat. Boleh memakai **tebal**, *miring*, dan rumus $...$."
        error={errors.instructions}
      />
      {isMath ? (
        <MathFields
          items={values.checks}
          onItems={(items) => set('checks', items)}
          rows={variableRows}
          onRows={setVariableRows}
          errors={errors}
        />
      ) : (
        <>
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {values.language === 'flowchart' ? 'Flowchart awal' : 'Kode awal'}{' '}
              <span className="font-normal text-slate-500">(opsional, kerangka untuk siswa)</span>
            </span>
            {values.language === 'flowchart' ? (
              <FlowchartEditor
                value={values.starter_code}
                onChange={(value) => set('starter_code', value)}
              />
            ) : (
              <CodeEditor
                key={values.language}
                value={values.starter_code}
                onChange={(value) => set('starter_code', value)}
                language={values.language}
                minHeight="8rem"
                label="Kode awal"
              />
            )}
            {errors.starter_code && (
              <p className="mt-1 text-xs text-red-600">{errors.starter_code}</p>
            )}
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-slate-700">Pemeriksaan otomatis</legend>
            <p className="text-xs text-slate-500">
              {isIoLanguage(values.language)
                ? `Setiap pemeriksaan: Masukan (baris-baris untuk ${INPUT_HINTS[values.language]}) dan Keluaran yang harus ditampilkan ${OUTPUT_HINTS[values.language]}. Spasi di akhir baris diabaikan.`
                : 'Diperiksa di halaman hasil kode siswa. Elemen ditulis dengan selector CSS, mis. h1, #hasil, .kotak.'}
            </p>
            {values.checks.map((check, index) => (
              <div key={index} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-600">
                    Pemeriksaan {index + 1}
                  </span>
                  {values.checks.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          'checks',
                          values.checks.filter((_, i) => i !== index),
                        )
                      }
                      className="text-xs text-red-600 hover:underline"
                    >
                      Hapus
                    </button>
                  )}
                </div>
                {isIoLanguage(values.language) ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CodeArea
                      label="Masukan"
                      value={check.input}
                      onChange={(value) => setCheck(index, { input: value })}
                      placeholder={'3\n4'}
                    />
                    <CodeArea
                      label="Keluaran yang diharapkan"
                      value={check.output}
                      onChange={(value) => setCheck(index, { output: value })}
                      placeholder="7"
                    />
                  </div>
                ) : (
                  <HtmlCheckFields check={check} onChange={(changes) => setCheck(index, changes)} />
                )}
                <p className="mt-2 text-xs text-slate-500">
                  Dilihat siswa: {checkLabel(check, values.language)}
                </p>
              </div>
            ))}
            {values.checks.length < 10 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => set('checks', [...values.checks, emptyCheck(values.language)])}
              >
                <Plus className="size-4" aria-hidden="true" /> Tambah Pemeriksaan
              </Button>
            )}
            {errors.checks && <p className="text-sm text-red-600">{errors.checks}</p>}
          </fieldset>
        </>
      )}

      <Alert type="error">{problem || generalError || errors.material}</Alert>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Batal
        </Button>
        <Button type="submit" loading={submitting}>
          Simpan
        </Button>
      </div>
    </form>
  )
}

// Form soal Matematika: variabel angka acak + daftar soal (pertanyaan, rumus jawaban, toleransi).
function MathFields({ items, onItems, rows, onRows, errors }) {
  const setItem = (index, changes) =>
    onItems(items.map((item, i) => (i === index ? { ...item, ...changes } : item)))
  const setRow = (index, changes) =>
    onRows(rows.map((row, i) => (i === index ? { ...row, ...changes } : row)))

  return (
    <>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">Angka acak per siswa</legend>
        <p className="text-xs text-slate-500">
          Setiap siswa mendapat angka berbeda (tetap sama setiap kali ia membuka soal). Tulis [a] di
          pertanyaan untuk menampilkan angkanya, dan a di rumus jawaban. Kosongkan jika tidak perlu.
        </p>
        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-[4rem_1fr_1fr_1fr_auto] items-end gap-2">
            <TextField
              label="Huruf"
              maxLength={1}
              value={row.name}
              onChange={(e) => setRow(index, { name: e.target.value.toLowerCase() })}
            />
            <TextField
              label="Terkecil"
              inputMode="decimal"
              value={row.min}
              onChange={(e) => setRow(index, { min: e.target.value })}
            />
            <TextField
              label="Terbesar"
              inputMode="decimal"
              value={row.max}
              onChange={(e) => setRow(index, { max: e.target.value })}
            />
            <TextField
              label="Langkah"
              inputMode="decimal"
              value={row.step}
              onChange={(e) => setRow(index, { step: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-0.5 text-red-600 hover:bg-red-50"
              aria-label={`Hapus variabel ${row.name}`}
              onClick={() => onRows(rows.filter((_, i) => i !== index))}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
        {rows.length < 8 && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onRows([...rows, { name: '', min: 1, max: 10, step: 1 }])}
          >
            <Plus className="size-4" aria-hidden="true" /> Tambah Variabel
          </Button>
        )}
        {errors.variables && <p className="text-sm text-red-600">{errors.variables}</p>}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-slate-700">Soal</legend>
        <p className="text-xs text-slate-500">
          Rumus jawaban memakai + - * / ^, sqrt(), pi, dan huruf variabel, mis. a*b, (a+b)x,
          3.14*r^2. Jawaban siswa yang setara dianggap benar (1/2 = 0,5; 2x+3 = 3+2x). Toleransi
          diisi jika jawaban dibulatkan, mis. 0.01.
        </p>
        {items.map((item, index) => (
          <div key={index} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-600">Soal {index + 1}</span>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => onItems(items.filter((_, i) => i !== index))}
                  className="text-xs text-red-600 hover:underline"
                >
                  Hapus
                </button>
              )}
            </div>
            <TextAreaField
              label="Pertanyaan"
              rows={2}
              value={item.question}
              placeholder="mis. Hitung $[a] \times [b]$."
              onChange={(e) => setItem(index, { question: e.target.value })}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_10rem]">
              <TextField
                label="Rumus jawaban"
                value={item.answer}
                placeholder="mis. a*b"
                onChange={(e) => setItem(index, { answer: e.target.value })}
              />
              <TextField
                label="Toleransi (opsional)"
                inputMode="decimal"
                value={item.tolerance}
                placeholder="mis. 0.01"
                onChange={(e) => setItem(index, { tolerance: e.target.value })}
              />
            </div>
          </div>
        ))}
        {items.length < 10 && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onItems([...items, emptyCheck('math')])}
          >
            <Plus className="size-4" aria-hidden="true" /> Tambah Soal
          </Button>
        )}
        {errors.checks && <p className="text-sm text-red-600">{errors.checks}</p>}
      </fieldset>
    </>
  )
}

function CodeArea({ label, value, onChange, placeholder }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-lg bg-white px-3 py-2 font-mono text-base text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-500 focus:outline-none sm:text-sm"
      />
    </label>
  )
}

function HtmlCheckFields({ check, onChange }) {
  const type = HTML_CHECK_TYPES.find((t) => t.value === check.type)
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        label="Jenis"
        options={HTML_CHECK_TYPES}
        value={check.type}
        onChange={(e) => onChange({ type: e.target.value })}
      />
      {type.fields.map((field) => (
        <TextField
          key={field}
          label={FIELD_LABELS[field]}
          value={check[field] ?? ''}
          placeholder={FIELD_PLACEHOLDERS[field]}
          onChange={(e) => onChange({ [field]: e.target.value })}
        />
      ))}
    </div>
  )
}

// Pekerjaan semua siswa di satu soal: status, jumlah periksa, dan kode (saat lulus / terakhir).
function StudentWork({ exercise }) {
  const work = useFetch(codeExercisesApi.attempts, exercise.id)
  const [open, setOpen] = useState(null) // { student, which: 'passed' | 'last' }
  const rows = work.data?.rows ?? []
  const passed = rows.filter((row) => row.passed).length

  if (work.loading && !rows.length) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }
  return (
    <div className="space-y-3 text-sm">
      <Alert type="error">{work.error}</Alert>
      <p className="text-slate-600">
        {passed} dari {rows.length} siswa lulus.
      </p>
      {rows.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-slate-500 ring-1 ring-slate-200">
          Belum ada siswa di kelas ini.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {rows.map((row) => {
            const showing = open?.student === row.student
            const code = open?.which === 'passed' ? row.passed_code : row.code
            return (
              <li key={row.student} className="p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 font-medium text-slate-900">{row.full_name}</span>
                  {row.passed ? (
                    <Badge color="green">Lulus</Badge>
                  ) : row.updated_at ? (
                    <Badge color="amber">Belum lulus</Badge>
                  ) : (
                    <Badge color="gray">Belum mengerjakan</Badge>
                  )}
                  <span className="text-xs text-slate-500">
                    {row.check_count}× periksa
                    {row.updated_at && ` • ${formatDate(row.updated_at)}`}
                  </span>
                  {row.passed && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setOpen(
                          showing && open.which === 'passed'
                            ? null
                            : { student: row.student, which: 'passed' },
                        )
                      }
                    >
                      Kode saat lulus
                    </Button>
                  )}
                  {row.updated_at && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setOpen(
                          showing && open.which === 'last'
                            ? null
                            : { student: row.student, which: 'last' },
                        )
                      }
                    >
                      Kode terakhir
                    </Button>
                  )}
                </div>
                {showing && (
                  <div className="mt-2">
                    {exercise.language === 'flowchart' ? (
                      <FlowchartDiagram
                        program={parseProgram(code)}
                        title={`Flowchart ${row.full_name}`}
                      />
                    ) : (
                      <CodeEditor
                        key={`${row.student}-${open.which}`}
                        value={code || ''}
                        language={exercise.language}
                        readOnly
                        minHeight="6rem"
                        label={`Kode ${row.full_name}`}
                      />
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
