import { ArrowDown, ArrowUp, FileUp, Lock } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { assessmentsApi, questionsApi } from '../../api/assessments'
import Alert from '../../components/Alert'
import AnswerReview from '../../components/AnswerReview'
import { QuestionBody } from '../../components/QuestionContent'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import DataTable from '../../components/DataTable'
import DeleteDialog from '../../components/DeleteDialog'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import useFetch from '../../hooks/useFetch'
import { useTabs } from '../../hooks/useTabs'
import { attemptStatus, KIND_COLORS, QUESTION_KINDS } from '../../utils/assessments'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import { formatDate } from '../../utils/media'
import { formatScore } from '../../utils/tasks'
import AssessmentFormModal from './AssessmentFormModal'
import GradeAttemptModal from './GradeAttemptModal'
import ImportQuestionsModal from './ImportQuestionsModal'
import QuestionFormModal from './QuestionFormModal'

const TABS = [
  { id: 'soal', label: 'Soal' },
  { id: 'hasil', label: 'Hasil' },
]

function QuestionsTab({ assessment, onChanged }) {
  const questions = useFetch(assessmentsApi.questions, assessment.id)
  const [dialog, setDialog] = useState(null) // { type: 'form' | 'delete' | 'import', question, kind }
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const locked = assessment.locked
  const list = questions.data ?? []

  const refresh = () => {
    setDialog(null)
    questions.reload()
    onChanged()
  }

  // Tukar urutan dua soal bersebelahan.
  const move = async (index, direction) => {
    const a = list[index]
    const b = list[index + direction]
    setError('')
    try {
      await questionsApi.update(a.id, { order: index + direction })
      await questionsApi.update(b.id, { order: index })
      questions.reload()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <>
      {locked ? (
        <Alert type="info" className="mb-4">
          <Lock className="mr-1 inline size-4" aria-hidden="true" />
          Soal terkunci karena sudah ada siswa yang mulai mengerjakan, agar penilaian tetap adil.
        </Alert>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button onClick={() => setDialog({ type: 'form', kind: 'choice' })}>
            + Pilihan Ganda
          </Button>
          <Button variant="secondary" onClick={() => setDialog({ type: 'form', kind: 'multiple' })}>
            + PG Kompleks
          </Button>
          <Button variant="secondary" onClick={() => setDialog({ type: 'form', kind: 'category' })}>
            + Kategori (Benar/Salah)
          </Button>
          <Button variant="secondary" onClick={() => setDialog({ type: 'form', kind: 'essay' })}>
            + Esai
          </Button>
          <Button variant="secondary" onClick={() => setDialog({ type: 'import' })}>
            <FileUp className="size-4" aria-hidden="true" /> Impor Soal (Word / Excel)
          </Button>
        </div>
      )}
      <Alert type="success" className="mb-3">
        {notice}
      </Alert>
      <Alert type="error">{error || questions.error}</Alert>

      {questions.loading && !questions.data ? (
        <div className="py-10 text-center text-brand-600">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="Belum ada soal">
          Tambahkan soal pilihan ganda, PG kompleks, kategori, atau esai.
        </EmptyState>
      ) : (
        <ol className="space-y-3">
          {list.map((q, index) => (
            <li key={q.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-900">{index + 1}.</span>
                  <Badge color={KIND_COLORS[q.kind]}>{QUESTION_KINDS[q.kind]}</Badge>
                  {q.group && <Badge color="gray">Grup {q.group}</Badge>}
                  <span className="text-xs text-slate-500">{q.points} poin</span>
                </div>
                {!locked && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label="Naikkan"
                    >
                      <ArrowUp className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={index === list.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label="Turunkan"
                    >
                      <ArrowDown className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialog({ type: 'form', question: q })}
                    >
                      Ubah
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => setDialog({ type: 'delete', question: q })}
                    >
                      Hapus
                    </Button>
                  </div>
                )}
              </div>
              <div className="mt-2 text-slate-800">
                <QuestionBody question={q} />
              </div>
              {q.kind !== 'essay' && (
                <div className="mt-2">
                  <AnswerReview question={q} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {dialog?.type === 'import' && (
        <ImportQuestionsModal
          assessmentId={assessment.id}
          onClose={() => setDialog(null)}
          onImported={(count) => {
            setNotice(`${count} soal berhasil ditambahkan.`)
            refresh()
          }}
        />
      )}
      {dialog?.type === 'form' && (
        <QuestionFormModal
          question={dialog.question}
          kind={dialog.kind}
          assessmentId={assessment.id}
          nextOrder={list.length}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
      <DeleteDialog
        item={dialog?.type === 'delete' ? dialog.question : null}
        title="Hapus Soal"
        message={() => 'Hapus soal ini?'}
        onDelete={(q) => questionsApi.remove(q.id)}
        onDeleted={refresh}
        onClose={() => setDialog(null)}
      />
    </>
  )
}

function ResultsTab({ assessment }) {
  const results = useFetch(assessmentsApi.results, assessment.id)
  const [grading, setGrading] = useState(null)
  const rows = results.data ?? []

  const columns = [
    { header: 'No', className: 'w-12', cell: (row) => rows.indexOf(row) + 1 },
    {
      header: 'Nama',
      cell: (row) => <span className="font-medium text-slate-900">{row.student.full_name}</span>,
    },
    {
      header: 'Status',
      cell: (row) => {
        const status = attemptStatus(row.attempt)
        return (
          <span className="flex flex-wrap gap-1">
            <Badge color={status.color}>{status.label}</Badge>
            {row.attempt?.is_late && <Badge color="red">Terlambat</Badge>}
          </span>
        )
      },
    },
    {
      header: 'Keluar Halaman',
      className: 'text-center',
      cell: (row) =>
        row.attempt ? (
          <span
            className={
              row.attempt.violation_count ? 'font-semibold text-red-600' : 'text-slate-400'
            }
          >
            {row.attempt.violation_count}×
            {row.attempt.auto_submitted && (
              <span className="block text-xs font-normal">dikumpulkan otomatis</span>
            )}
          </span>
        ) : (
          <span className="text-slate-300">-</span>
        ),
    },
    {
      header: 'Dikumpulkan',
      cell: (row) => (row.attempt?.submitted_at ? formatDate(row.attempt.submitted_at) : '-'),
    },
    {
      header: 'Nilai',
      cell: (row) => {
        const a = row.attempt
        if (!a?.submitted_at) return <span className="text-slate-400">-</span>
        return (
          <span className="font-semibold text-slate-900">
            {formatScore(a.score ?? a.auto_score)}
            <span className="font-normal text-slate-500">/{assessment.max_score}</span>
            {a.score === null && (
              <span className="block text-xs font-normal text-amber-700">sementara</span>
            )}
          </span>
        )
      },
    },
    {
      header: 'Aksi',
      className: 'text-right',
      cell: (row) =>
        row.attempt?.submitted_at && (
          <Button variant="ghost" size="sm" onClick={() => setGrading(row.attempt.id)}>
            {row.attempt.status === 'submitted' ? 'Nilai Esai' : 'Lihat Jawaban'}
          </Button>
        ),
    },
  ]

  return (
    <>
      <Alert type="error">{results.error}</Alert>
      <DataTable
        columns={columns}
        rows={rows}
        loading={results.loading}
        rowKey={(row) => row.student.id}
        emptyMessage="Belum ada siswa di kelas ini."
      />
      {grading && (
        <GradeAttemptModal
          attemptId={grading}
          onClose={() => setGrading(null)}
          onSaved={() => {
            setGrading(null)
            results.reload()
          }}
        />
      )}
    </>
  )
}

// Editor + hasil satu lembar asesmen (guru).
export default function AssessmentEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const assessment = useFetch(assessmentsApi.get, id)
  const [tab, tabsBar] = useTabs(TABS)
  const [dialog, setDialog] = useState(null) // 'edit' | 'delete'
  const [notice, setNotice] = useState({ type: 'success', text: '' })

  if (assessment.error) {
    return (
      <Alert type="error">
        {assessment.error}{' '}
        <Link to="/guru/asesmen" className="font-medium underline">
          Kembali
        </Link>
      </Alert>
    )
  }
  if (!assessment.data) {
    return (
      <div className="py-10 text-center text-brand-600">
        <Spinner />
      </div>
    )
  }

  const a = assessment.data
  const togglePublish = async () => {
    try {
      const saved = await assessmentsApi.update(a.id, { is_published: !a.is_published })
      setNotice({
        type: 'success',
        text: saved.is_published
          ? 'Asesmen diterbitkan. Siswa sudah bisa mengerjakan.'
          : 'Asesmen dijadikan draf.',
      })
      assessment.reload()
    } catch (err) {
      setNotice({ type: 'error', text: getFieldErrors(err).is_published ?? getErrorMessage(err) })
    }
  }

  return (
    <>
      <Link to="/guru/asesmen" className="mb-2 inline-block text-sm text-brand-700 hover:underline">
        ← Lembar asesmen
      </Link>
      <PageHeader
        title={a.title}
        description={`${a.subject_name} · ${a.classroom_name} · tenggat ${formatDate(a.due_at)}${
          a.duration_minutes ? ` · ${a.duration_minutes} menit` : ' · tanpa batas waktu'
        } · ${a.question_count} soal · ${a.max_score} poin`}
        actions={
          <>
            <Button variant={a.is_published ? 'secondary' : 'primary'} onClick={togglePublish}>
              {a.is_published ? 'Jadikan Draf' : 'Terbitkan'}
            </Button>
            <Button variant="secondary" onClick={() => setDialog('edit')}>
              Ubah Info
            </Button>
            <Button variant="danger" onClick={() => setDialog('delete')}>
              Hapus
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge color={a.is_published ? 'green' : 'amber'}>
          {a.is_published ? 'Terbit — terlihat oleh siswa' : 'Draf — belum terlihat oleh siswa'}
        </Badge>
        {a.needs_grading_count > 0 && (
          <Badge color="amber">{a.needs_grading_count} esai perlu dinilai</Badge>
        )}
      </div>
      <Alert type={notice.type} className="mb-4">
        {notice.text}
      </Alert>
      {a.instructions && (
        <p className="mb-4 text-sm whitespace-pre-line text-slate-600">{a.instructions}</p>
      )}

      {tabsBar}
      {tab === 'soal' && <QuestionsTab assessment={a} onChanged={assessment.reload} />}
      {tab === 'hasil' && <ResultsTab assessment={a} />}

      {dialog === 'edit' && (
        <AssessmentFormModal
          assessment={a}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            setNotice({ type: 'success', text: 'Info asesmen diperbarui.' })
            assessment.reload()
          }}
        />
      )}
      <DeleteDialog
        item={dialog === 'delete' ? a : null}
        title="Hapus Lembar Asesmen"
        message={(item) => `Hapus "${item.title}" beserta semua soalnya?`}
        onDelete={(item) => assessmentsApi.remove(item.id)}
        onDeleted={() => navigate('/guru/asesmen', { replace: true })}
        onClose={() => setDialog(null)}
      />
    </>
  )
}
