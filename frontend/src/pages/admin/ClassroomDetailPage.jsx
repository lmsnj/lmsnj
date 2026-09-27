import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { assignmentsApi, classroomsApi } from '../../api/academics'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import DataTable from '../../components/DataTable'
import DeleteDialog from '../../components/DeleteDialog'
import ClassHero, { Avatar } from '../../components/ClassHero'
import { FullPageSpinner } from '../../components/Spinner'
import useFetch from '../../hooks/useFetch'
import { ALL } from '../../utils/academic'
import AddStudentsModal from './AddStudentsModal'
import AssignmentFormModal from './AssignmentFormModal'
import ClassroomFormModal from './ClassroomFormModal'

export default function ClassroomDetailPage() {
  const { id } = useParams()
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState(null)

  const classroom = useFetch(classroomsApi.get, id)
  const students = useFetch(classroomsApi.students, id)
  const assignments = useFetch(assignmentsApi.list, { ...ALL, classroom: id })

  if (classroom.loading && !classroom.data) return <FullPageSpinner />
  if (classroom.error) {
    return (
      <Alert type="error">
        {classroom.error}{' '}
        <Link to="/admin/kelas" className="font-medium underline">
          Kembali ke daftar kelas
        </Link>
      </Alert>
    )
  }

  const room = classroom.data
  const closeDialog = () => setDialog(null)
  const done = (message) => {
    closeDialog()
    setNotice(message)
    classroom.reload()
    students.reload()
    assignments.reload()
  }

  const studentColumns = [
    { header: 'No', className: 'w-12', cell: (s) => students.data.indexOf(s) + 1 },
    {
      header: 'Nama',
      cell: (s) => <span className="font-medium text-slate-900">{s.full_name}</span>,
    },
    { header: 'NIS', cell: (s) => s.nis || '-' },
    {
      header: 'Aksi',
      className: 'text-right',
      cell: (student) => (
        <Button
          variant="ghost"
          size="sm"
          className="text-red-600 hover:bg-red-50"
          onClick={() => setDialog({ type: 'remove-student', student })}
        >
          Keluarkan
        </Button>
      ),
    },
  ]

  const assignmentColumns = [
    { header: 'Mapel', cell: (a) => <span className="font-medium">{a.subject_name}</span> },
    { header: 'Guru', cell: (a) => a.teacher_name },
    {
      header: 'Aksi',
      className: 'text-right whitespace-nowrap',
      cell: (assignment) => (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDialog({ type: 'assignment', assignment })}
          >
            Ubah
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50"
            onClick={() => setDialog({ type: 'delete-assignment', assignment })}
          >
            Hapus
          </Button>
        </>
      ),
    },
  ]

  return (
    <>
      <ClassHero
        back={{ to: '/admin/kelas', label: 'Kelas' }}
        title={room.name}
        info={[
          <>
            Tahun Ajaran <strong className="text-slate-800">{room.academic_year}</strong>
          </>,
          `Jurusan ${room.major}`,
          `${students.data?.length ?? room.student_count ?? 0} siswa`,
          <>
            Wali kelas{' '}
            {room.homeroom_teacher_name ? (
              <>
                <Avatar name={room.homeroom_teacher_name} />
                <strong className="text-slate-800">{room.homeroom_teacher_name}</strong>
              </>
            ) : (
              'belum ditentukan'
            )}
          </>,
        ]}
        actions={
          <Button variant="secondary" onClick={() => setDialog({ type: 'edit-classroom' })}>
            Ubah Kelas
          </Button>
        }
      />

      <Alert type="success" className="mb-4">
        {notice}
      </Alert>

      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Mapel & Pengampu</h2>
            <Button size="sm" onClick={() => setDialog({ type: 'assignment', assignment: null })}>
              + Tambah Mapel
            </Button>
          </div>
          <Alert type="error">{assignments.error}</Alert>
          <DataTable
            columns={assignmentColumns}
            rows={assignments.data?.results}
            loading={assignments.loading}
            emptyMessage="Belum ada mapel di kelas ini."
          />
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">
              Siswa <span className="text-slate-500">({students.data?.length ?? 0})</span>
            </h2>
            <Button size="sm" onClick={() => setDialog({ type: 'add-students' })}>
              + Tambah Siswa
            </Button>
          </div>
          <Alert type="error">{students.error}</Alert>
          <DataTable
            columns={studentColumns}
            rows={students.data}
            loading={students.loading}
            emptyMessage="Belum ada siswa di kelas ini."
          />
        </section>
      </div>

      {dialog?.type === 'edit-classroom' && (
        <ClassroomFormModal
          classroom={room}
          onClose={closeDialog}
          onSaved={() => done('Data kelas diperbarui.')}
        />
      )}
      {dialog?.type === 'assignment' && (
        <AssignmentFormModal
          assignment={dialog.assignment}
          fixedClassroom={room}
          onClose={closeDialog}
          onSaved={(saved, isEdit) =>
            done(`Mapel ${saved.subject_name} ${isEdit ? 'diperbarui' : 'ditambahkan'}.`)
          }
        />
      )}
      {dialog?.type === 'add-students' && (
        <AddStudentsModal classroom={room} onClose={closeDialog} onDone={done} />
      )}
      <DeleteDialog
        item={dialog?.type === 'delete-assignment' ? dialog.assignment : null}
        title="Hapus Mapel dari Kelas"
        message={(a) => `Hapus ${a.subject_name} (${a.teacher_name}) dari kelas ${room.name}?`}
        onDelete={(a) => assignmentsApi.remove(a.id)}
        onDeleted={(a) => done(`Mapel ${a.subject_name} dihapus dari kelas.`)}
        onClose={closeDialog}
      />
      <DeleteDialog
        item={dialog?.type === 'remove-student' ? dialog.student : null}
        title="Keluarkan Siswa"
        message={(s) =>
          `Keluarkan ${s.full_name} dari ${room.name}? Akun siswa tetap ada, hanya belum punya kelas.`
        }
        onDelete={(s) => classroomsApi.removeStudents(room.id, [s.id])}
        onDeleted={(s) => done(`${s.full_name} dikeluarkan dari kelas.`)}
        onClose={closeDialog}
      />
    </>
  )
}
