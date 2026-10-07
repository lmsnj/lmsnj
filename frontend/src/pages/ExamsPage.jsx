import { CalendarDays, IdCard, ListChecks, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { examsApi } from '../api/exams'
import AdminCard, { CardGrid } from '../components/AdminCard'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import Button from '../components/Button'
import DeleteDialog from '../components/DeleteDialog'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import useAuth from '../hooks/useAuth'
import useFetch from '../hooks/useFetch'
import useQueryFlag from '../hooks/useQueryFlag'
import { ALL } from '../utils/academic'
import { isAdminRole } from '../utils/constants'
import { formatDateRange, gradesLabel, requirementSummary } from '../utils/exams'
import ExamEventFormModal from './admin/ExamEventFormModal'

// Daftar acara ujian. Admin: kelola acara & syarat. Guru: lihat acara untuk kelas yang ia walikan.
export default function ExamsPage() {
  const { user } = useAuth()
  const isAdmin = isAdminRole(user.role)
  const base = isAdmin ? '/admin/ujian' : '/guru/ujian'
  const events = useFetch(examsApi.list, ALL)
  // null = tertutup, {} = acara baru. ?baru=1 (dari Beranda) langsung membuka form.
  const isNew = useQueryFlag('baru')
  const [editing, setEditing] = useState(isNew && isAdmin ? {} : null)
  const [deleting, setDeleting] = useState(null)
  const [notice, setNotice] = useState('')
  const list = events.data?.results ?? []

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Ujian & Kartu Ujian' : 'Kartu Ujian Kelas Wali'}
        description={
          isAdmin
            ? 'Atur acara ujian, syarat kartu ujian, pengecualian, lalu cetak kartu per kelas.'
            : 'Periksa siswa kelas wali Anda yang memenuhi syarat ujian, lalu cetak kartunya.'
        }
        actions={
          isAdmin && (
            <Button onClick={() => setEditing({})}>
              <Plus className="size-4" aria-hidden="true" /> Tambah Acara
            </Button>
          )
        }
      />
      <Alert type="success" className="mb-4">
        {notice}
      </Alert>
      <Alert type="error" className="mb-4">
        {events.error}
      </Alert>

      {events.loading && !events.data ? (
        <div className="py-10 text-center text-brand-600">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="Belum ada acara ujian">
          {isAdmin
            ? 'Tambah acara ujian (mis. PTS atau PAS) beserta syarat kartu ujiannya.'
            : 'Admin belum membuat acara ujian.'}
        </EmptyState>
      ) : (
        <CardGrid>
          {list.map((event) => {
            const requirements = requirementSummary(event)
            return (
              <AdminCard
                key={event.id}
                tone="bg-sky-50"
                icon={
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                    <IdCard className="size-6" aria-hidden="true" />
                  </span>
                }
                title={event.name}
                subtitle={`Tahun ajaran ${event.academic_year}`}
                to={`${base}/${event.id}`}
                meta={[
                  {
                    icon: CalendarDays,
                    content: formatDateRange(event.exam_start, event.exam_end),
                  },
                  { icon: Users, content: gradesLabel(event.grades) },
                  {
                    icon: ListChecks,
                    content: requirements.length ? requirements.join(' • ') : 'Tanpa syarat',
                  },
                ]}
                badges={requirements.length === 0 && <Badge>Tanpa syarat</Badge>}
                actions={
                  isAdmin && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(event)}>
                        <Pencil className="size-4" aria-hidden="true" /> Ubah
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(event)}>
                        <Trash2 className="size-4" aria-hidden="true" /> Hapus
                      </Button>
                    </>
                  )
                }
              />
            )
          })}
        </CardGrid>
      )}

      {editing && (
        <ExamEventFormModal
          event={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={(saved, updated) => {
            setEditing(null)
            setNotice(`Acara "${saved.name}" berhasil ${updated ? 'diubah' : 'ditambahkan'}.`)
            events.reload()
          }}
        />
      )}
      <DeleteDialog
        item={deleting}
        title="Hapus Acara Ujian"
        message={(event) =>
          `Hapus "${event.name}"? Centang wali kelas, pengecualian, dan ruang ujian di acara ini ikut terhapus.`
        }
        onDelete={(event) => examsApi.remove(event.id)}
        onDeleted={(event) => {
          setDeleting(null)
          setNotice(`Acara "${event.name}" dihapus.`)
          events.reload()
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}
