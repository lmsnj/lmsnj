import { ArrowDown, ArrowUp, Library, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { qrQuizApi } from '../../api/qrQuiz'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'
import { emptyQuestion, LETTERS } from '../../utils/qrQuiz'
import Alert from '../Alert'
import Button from '../Button'
import FormModal from '../FormModal'
import RichText from '../RichText'
import Spinner from '../Spinner'
import TextAreaField from '../TextAreaField'
import TextField, { inputClass } from '../TextField'

// Soal PG dari asesmen kelas-mapel ini; klik = disalin ke kuis (soal aslinya tidak berubah).
function BankPicker({ questions, onPick }) {
  const [query, setQuery] = useState('')
  const shown = questions.filter((q) =>
    `${q.assessment} ${q.text}`.toLowerCase().includes(query.trim().toLowerCase()),
  )
  if (questions.length === 0) {
    return (
      <Alert type="info">
        Belum ada soal pilihan ganda (maks. jumlah pilihan kartu) di asesmen kelas-mapel ini.
      </Alert>
    )
  }
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
      <TextField
        placeholder="Cari soal..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Cari soal di bank soal"
      />
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {shown.map((q) => (
          <li key={q.id}>
            <button
              type="button"
              onClick={() => onPick(q)}
              className="w-full rounded-lg bg-white p-2 text-left text-sm ring-1 ring-slate-200 hover:ring-brand-400"
            >
              <span className="block text-xs text-slate-500">{q.assessment}</span>
              <RichText text={q.text} as="span" className="line-clamp-2 text-slate-800" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function QuestionEditor({
  question,
  index,
  count,
  optionLimit,
  error,
  onChange,
  onMove,
  onRemove,
}) {
  const setChoice = (choiceIndex, value) =>
    onChange({
      ...question,
      choices: question.choices.map((c, i) => (i === choiceIndex ? value : c)),
    })
  const setCount = (size) => {
    const choices = Array.from({ length: size }, (_, i) => question.choices[i] ?? '')
    onChange({ ...question, choices, correct: Math.min(question.correct, size - 1) })
  }
  return (
    <fieldset className="space-y-3 rounded-lg p-3 ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2">
        <legend className="text-sm font-semibold text-slate-800">Soal {index + 1}</legend>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Naikkan"
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            aria-label="Turunkan"
          >
            <ArrowDown className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={count === 1}
            aria-label={`Hapus soal ${index + 1}`}
          >
            <Trash2 className="size-4 text-red-600" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <TextAreaField
        label="Pertanyaan"
        rows={2}
        value={question.text}
        maxLength={2000}
        onChange={(event) => onChange({ ...question, text: event.target.value })}
        hint="Boleh memakai rumus $...$ seperti di soal asesmen."
      />
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-700">Pilihan (klik huruf = jawaban benar)</p>
          <select
            className={`${inputClass} w-auto ring-slate-300`}
            value={question.choices.length}
            onChange={(event) => setCount(Number(event.target.value))}
            aria-label="Jumlah pilihan"
          >
            {Array.from({ length: optionLimit - 1 }, (_, i) => i + 2).map((size) => (
              <option key={size} value={size}>
                {size} pilihan
              </option>
            ))}
          </select>
        </div>
        {question.choices.map((choice, choiceIndex) => (
          <div key={choiceIndex} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChange({ ...question, correct: choiceIndex })}
              aria-pressed={question.correct === choiceIndex}
              aria-label={`Jadikan ${LETTERS[choiceIndex]} jawaban benar`}
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg font-bold ring-1 ${
                question.correct === choiceIndex
                  ? 'bg-brand-600 text-white ring-brand-600'
                  : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
              }`}
            >
              {LETTERS[choiceIndex]}
            </button>
            <input
              className={`${inputClass} ring-slate-300`}
              value={choice}
              maxLength={300}
              onChange={(event) => setChoice(choiceIndex, event.target.value)}
              aria-label={`Pilihan ${LETTERS[choiceIndex]}`}
            />
          </div>
        ))}
      </div>
    </fieldset>
  )
}

function Form({ assignmentId, session, bank, onClose, onSaved }) {
  const optionLimit = bank.option_limit
  const [title, setTitle] = useState(session?.title ?? '')
  const [questions, setQuestions] = useState(
    () => session?.questions ?? [emptyQuestion(optionLimit)],
  )
  const [showBank, setShowBank] = useState(false)
  const [questionErrors, setQuestionErrors] = useState({})
  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    setQuestionErrors({})
    const data = { title, questions }
    try {
      const saved = session
        ? await qrQuizApi.update(session.id, data)
        : await qrQuizApi.create({ ...data, teaching_assignment: assignmentId })
      onSaved(saved)
    } catch (error) {
      const perQuestion = error?.response?.data?.questions
      if (perQuestion && typeof perQuestion === 'object' && !Array.isArray(perQuestion)) {
        setQuestionErrors(perQuestion)
        error.response.data.questions = 'Periksa soal yang ditandai merah.'
      }
      throw error
    }
  })
  const update = (index, value) => setQuestions(questions.map((q, i) => (i === index ? value : q)))
  const move = (index, step) => {
    const next = [...questions]
    ;[next[index], next[index + step]] = [next[index + step], next[index]]
    setQuestions(next)
  }
  const pick = (q) => {
    const copy = { text: q.text, choices: q.choices, correct: q.correct }
    // Soal pertama yang masih kosong diganti; selain itu ditambahkan di akhir.
    const blank = questions.length === 1 && !questions[0].text.trim()
    setQuestions(blank ? [copy] : [...questions, copy])
  }

  return (
    <FormModal
      size="lg"
      title={session ? 'Ubah Kuis QR' : 'Kuis QR Baru'}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError || errors.teaching_assignment || errors.questions}
      submitLabel="Simpan"
    >
      <TextField
        label="Judul"
        placeholder="mis. Kuis Pembuka Bab 2"
        value={title}
        maxLength={150}
        onChange={(event) => setTitle(event.target.value)}
        error={errors.title}
        required
      />
      {questions.map((question, index) => (
        <QuestionEditor
          key={index}
          question={question}
          index={index}
          count={questions.length}
          optionLimit={optionLimit}
          error={questionErrors[index]}
          onChange={(value) => update(index, value)}
          onMove={(step) => move(index, step)}
          onRemove={() => setQuestions(questions.filter((_, i) => i !== index))}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => setQuestions([...questions, emptyQuestion(optionLimit)])}
        >
          <Plus className="size-4" aria-hidden="true" /> Tambah Soal
        </Button>
        <Button variant="secondary" onClick={() => setShowBank(!showBank)} aria-expanded={showBank}>
          <Library className="size-4" aria-hidden="true" /> Ambil dari Bank Soal (
          {bank.questions.length})
        </Button>
      </div>
      {showBank && <BankPicker questions={bank.questions} onPick={pick} />}
    </FormModal>
  )
}

/** Tambah/ubah kuis: judul + soal PG (2..kuis_qr.jumlah_opsi pilihan), bisa diambil dari bank soal. */
export default function QuizFormModal({ assignmentId, session, onClose, onSaved }) {
  const bank = useFetch(qrQuizApi.bank, assignmentId)
  if (!bank.data) {
    return (
      <FormModal
        title="Kuis QR"
        onClose={onClose}
        onSubmit={(e) => e.preventDefault()}
        error={bank.error}
      >
        {!bank.error && (
          <div className="py-8 text-center text-brand-600">
            <Spinner />
          </div>
        )}
      </FormModal>
    )
  }
  return (
    <Form
      assignmentId={assignmentId}
      session={session}
      bank={bank.data}
      onClose={onClose}
      onSaved={onSaved}
    />
  )
}
