import {
  ClipboardCheck,
  IdCard,
  MonitorPlay,
  Pencil,
  Plus,
  Printer,
  QrCode,
  ScanLine,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { assignmentsApi } from '../../api/academics'
import { qrCardsApi, qrQuizApi } from '../../api/qrQuiz'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import ClassHero from '../../components/ClassHero'
import DeleteDialog from '../../components/DeleteDialog'
import EmptyState from '../../components/EmptyState'
import CardMapModal from '../../components/qrQuiz/CardMapModal'
import QuizFormModal from '../../components/qrQuiz/QuizFormModal'
import Spinner from '../../components/Spinner'
import useFeature from '../../hooks/useFeature'
import useFetch from '../../hooks/useFetch'
import { ALL } from '../../utils/academic'

function Loading() {
  return (
    <div className="py-10 text-center text-brand-600">
      <Spinner />
    </div>
  )
}

const linkClass =
  'inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ring-1 transition'

function SessionStatus({ session }) {
  if (session.finished_at) return <Badge color="green">Selesai, nilai tersimpan</Badge>
  if (session.answer_count > 0) return <Badge color="amber">Berjalan</Badge>
  return <Badge>Belum dimulai</Badge>
}

function SessionCard({ session, assignmentId, onEdit, onDelete }) {
  const open = !session.finished_at
  return (
    <li className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{session.title}</p>
          <p className="text-xs text-slate-500">
            {session.question_count} soal • {session.answer_count} jawaban terbaca
            {session.created_by_name ? ` • ${session.created_by_name}` : ''}
          </p>
        </div>
        <SessionStatus session={session} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {open && (
          <>
            <Link
              to={`/kuis-qr/${session.id}/layar`}
              className={`${linkClass} bg-brand-600 text-white ring-brand-600 hover:bg-brand-700`}
            >
              <MonitorPlay className="size-4" aria-hidden="true" /> Layar TV
            </Link>
            <Link
              to={`/kuis-qr/${session.id}/pindai`}
              className={`${linkClass} bg-white text-brand-700 ring-brand-300 hover:bg-brand-50`}
            >
              <ScanLine className="size-4" aria-hidden="true" /> Pindai (HP)
            </Link>
          </>
        )}
        {session.grade_activity && (
          <Link
            to={`/guru/kelas/${assignmentId}/penilaian?p=${session.grade_activity}`}
            className={`${linkClass} bg-white text-slate-700 ring-slate-300 hover:bg-slate-50`}
          >
            <ClipboardCheck className="size-4" aria-hidden="true" /> Lihat Nilai
          </Link>
        )}
        {open && session.answer_count === 0 && (
          <Button variant="ghost" onClick={onEdit}>
            <Pencil className="size-4" aria-hidden="true" /> Ubah
          </Button>
        )}
        <Button variant="ghost" onClick={onDelete}>
          <Trash2 className="size-4 text-red-600" aria-hidden="true" /> Hapus
        </Button>
      </div>
    </li>
  )
}

// reloadKey ikut dikirim agar ringkasan dimuat ulang setelah peta kartu disimpan.
const loadCards = ({ id }) => qrCardsApi.get(id)

function CardSummary({ classroomId, reloadKey, onOpen }) {
  const cards = useFetch(loadCards, { id: classroomId, reloadKey })
  const rows = cards.data?.rows ?? []
  const missing = rows.filter((row) => !row.number).length
  if (!cards.data) return null
  if (rows.length && missing === rows.length) {
    return (
      <Alert type="warning" className="mb-4">
        Kartu belum dibagikan ke siswa kelas ini.{' '}
        <button type="button" onClick={onOpen} className="font-semibold underline">
          Atur Peta Kartu
        </button>{' '}
        (bisa diisi otomatis sesuai urutan nama).
      </Alert>
    )
  }
  if (missing > 0) {
    return (
      <Alert type="warning" className="mb-4">
        {missing} siswa belum punya nomor kartu; jawabannya tidak bisa dibaca.
      </Alert>
    )
  }
  return null
}

function Content({ assignment: a }) {
  const sessions = useFetch(qrQuizApi.list, { ...ALL, teaching_assignment: a.id })
  const [editing, setEditing] = useState(null) // null | 'new' | sesi
  const [deleting, setDeleting] = useState(null)
  const [showCards, setShowCards] = useState(false)
  const [cardsVersion, setCardsVersion] = useState(0)
  const list = sessions.data?.results ?? []

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden="true" /> Kuis Baru
        </Button>
        <Button variant="secondary" onClick={() => setShowCards(true)}>
          <IdCard className="size-4" aria-hidden="true" /> Peta Kartu
        </Button>
        <Link
          to="/cetak/kartu-qr"
          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          <Printer className="size-4" aria-hidden="true" /> Cetak Kartu
        </Link>
      </div>
      <CardSummary
        classroomId={a.classroom}
        reloadKey={cardsVersion}
        onOpen={() => setShowCards(true)}
      />
      <ol className="mb-6 grid gap-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200 sm:grid-cols-3">
        <li>
          <b>1. Layar TV:</b> buka di laptop yang tersambung ke TV. Soal tampil besar.
        </li>
        <li>
          <b>2. Pindai:</b> buka di HP Anda (akun yang sama). Siswa mengangkat kartu dengan huruf
          jawaban di atas.
        </li>
        <li>
          <b>3. Selesai:</b> nilai otomatis masuk ke Penilaian Langsung (jenis Kuis QR).
        </li>
      </ol>

      {sessions.error && <Alert type="error">{sessions.error}</Alert>}
      {!sessions.data && !sessions.error && <Loading />}
      {sessions.data && list.length === 0 && (
        <EmptyState title="Belum ada kuis QR">
          Buat kuis berisi soal pilihan ganda, atau ambil dari soal asesmen kelas ini.
        </EmptyState>
      )}
      <ul className="space-y-2">
        {list.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            assignmentId={a.id}
            onEdit={() => qrQuizApi.get(session.id).then(setEditing)}
            onDelete={() => setDeleting(session)}
          />
        ))}
      </ul>

      {editing && (
        <QuizFormModal
          assignmentId={a.id}
          session={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            sessions.reload()
          }}
        />
      )}
      {showCards && (
        <CardMapModal
          classroomId={a.classroom}
          onClose={() => setShowCards(false)}
          onSaved={() => setCardsVersion((v) => v + 1)}
        />
      )}
      <DeleteDialog
        item={deleting}
        title="Hapus kuis?"
        message={
          deleting?.finished_at
            ? `Kuis "${deleting?.title}" dihapus. Nilai yang sudah tersimpan di Penilaian Langsung tetap ada.`
            : `Kuis "${deleting?.title}" beserta jawaban yang sudah dipindai akan dihapus.`
        }
        onDelete={(item) => qrQuizApi.remove(item.id)}
        onDeleted={() => {
          setDeleting(null)
          sessions.reload()
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}

/** /guru/kelas/:id/kuis-qr — Kuis Kartu QR satu kelas-mapel (Mapel Umum Tahap 5). */
export default function QrQuizPage() {
  const { id } = useParams()
  const enabled = useFeature('kuis_qr')
  const assignment = useFetch(assignmentsApi.get, id)
  if (assignment.error) return <Alert type="error">{assignment.error}</Alert>
  if (!assignment.data) return <Loading />
  const a = assignment.data
  return (
    <>
      <ClassHero
        back={{ to: `/guru/kelas/${a.id}`, label: a.classroom_name }}
        title="Kuis Kartu QR"
        subject={a.subject_name}
        info={[a.classroom_name, 'Kuis satu kelas tanpa perangkat siswa']}
      />
      {enabled ? (
        <Content assignment={a} />
      ) : (
        <Alert type="warning">
          <QrCode className="mr-1 inline size-4" aria-hidden="true" />
          Kuis Kartu QR belum diaktifkan untuk sekolah ini.
        </Alert>
      )}
    </>
  )
}
