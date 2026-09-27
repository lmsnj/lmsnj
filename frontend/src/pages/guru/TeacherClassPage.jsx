import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { assignmentsApi, classroomsApi } from '../../api/academics'
import { materialsApi } from '../../api/materials'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import DataTable from '../../components/DataTable'
import DeleteDialog from '../../components/DeleteDialog'
import MaterialList from '../../components/MaterialList'
import MaterialViewer from '../../components/MaterialViewer'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import useFetch from '../../hooks/useFetch'
import { useTabs } from '../../hooks/useTabs'
import { ALL } from '../../utils/academic'
import { getErrorMessage } from '../../utils/errors'
import GradebookTab from './GradebookTab'
import MaterialFormModal from './MaterialFormModal'
import TasksTab from './TasksTab'

const TABS = [
  { id: 'materi', label: 'Materi' },
  { id: 'tugas', label: 'Tugas' },
  { id: 'nilai', label: 'Nilai' },
  { id: 'siswa', label: 'Siswa' },
]

function MaterialsTab({ assignmentId }) {
  const [notice, setNotice] = useState({ type: 'success', text: '' })
  // { type: 'form' | 'view' | 'delete', material }
  const [dialog, setDialog] = useState(null)
  const materials = useFetch(materialsApi.list, { ...ALL, teaching_assignment: assignmentId })

  const closeDialog = () => setDialog(null)

  const togglePublish = async (material) => {
    try {
      const saved = await materialsApi.update(material.id, { is_published: !material.is_published })
      setNotice({
        type: 'success',
        text: saved.is_published
          ? `"${saved.title}" diterbitkan dan kini terlihat oleh siswa.`
          : `"${saved.title}" dijadikan draf dan disembunyikan dari siswa.`,
      })
      materials.reload()
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err) })
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Materi berstatus <strong>Draf</strong> tidak terlihat oleh siswa.
        </p>
        <Button onClick={() => setDialog({ type: 'form', material: null })}>+ Tambah Materi</Button>
      </div>

      <div className="mb-3 space-y-3">
        <Alert type={notice.type}>{notice.text}</Alert>
        <Alert type="error">{materials.error}</Alert>
      </div>

      <MaterialList
        materials={materials.data?.results}
        loading={materials.loading}
        showStatus
        emptyTitle="Belum ada materi. Klik “Tambah Materi” untuk mulai."
        onOpen={(material) => setDialog({ type: 'view', material })}
        actions={(material) => (
          <>
            <Button variant="ghost" size="sm" onClick={() => togglePublish(material)}>
              {material.is_published ? 'Jadikan Draf' : 'Terbitkan'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDialog({ type: 'form', material })}>
              Ubah
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50"
              onClick={() => setDialog({ type: 'delete', material })}
            >
              Hapus
            </Button>
          </>
        )}
      />

      {dialog?.type === 'form' && (
        <MaterialFormModal
          material={dialog.material}
          assignmentId={assignmentId}
          onClose={closeDialog}
          onSaved={(saved, isEdit) => {
            closeDialog()
            setNotice({
              type: 'success',
              text: `Materi "${saved.title}" ${isEdit ? 'diperbarui' : 'ditambahkan'}.`,
            })
            materials.reload()
          }}
        />
      )}
      {dialog?.type === 'view' && (
        <MaterialViewer material={dialog.material} onClose={closeDialog} />
      )}
      <DeleteDialog
        item={dialog?.type === 'delete' ? dialog.material : null}
        title="Hapus Materi"
        message={(m) => `Hapus materi "${m.title}"? File yang diunggah juga akan dihapus.`}
        onDelete={(m) => materialsApi.remove(m.id)}
        onDeleted={(m) => {
          closeDialog()
          setNotice({ type: 'success', text: `Materi "${m.title}" dihapus.` })
          materials.reload()
        }}
        onClose={closeDialog}
      />
    </>
  )
}

function StudentsTab({ classroomId }) {
  const students = useFetch(classroomsApi.students, classroomId)
  const columns = [
    { header: 'No', className: 'w-12', cell: (s) => students.data.indexOf(s) + 1 },
    {
      header: 'Nama',
      cell: (s) => <span className="font-medium text-slate-900">{s.full_name}</span>,
    },
    { header: 'NIS', cell: (s) => s.nis || '-' },
  ]
  return (
    <>
      <Alert type="error">{students.error}</Alert>
      <DataTable
        columns={columns}
        rows={students.data}
        loading={students.loading}
        emptyMessage="Belum ada siswa di kelas ini."
      />
    </>
  )
}

// Halaman satu kelas-mapel milik guru: materi, tugas, rekap nilai, dan daftar siswa.
export default function TeacherClassPage() {
  const { id } = useParams()
  const assignment = useFetch(assignmentsApi.get, id)
  const [tab, tabsBar] = useTabs(TABS)

  if (assignment.error) {
    return (
      <Alert type="error">
        {assignment.error}{' '}
        <Link to="/guru/kelas" className="font-medium underline">
          Kembali
        </Link>
      </Alert>
    )
  }
  if (!assignment.data) {
    return (
      <div className="py-10 text-center text-brand-600">
        <Spinner />
      </div>
    )
  }

  const a = assignment.data
  return (
    <>
      <Link to="/guru/kelas" className="mb-2 inline-block text-sm text-brand-700 hover:underline">
        ← Kelas saya
      </Link>
      <PageHeader
        title={`${a.subject_name} · ${a.classroom_name}`}
        description={`Tahun ajaran ${a.academic_year} · ${a.student_count} siswa`}
      />
      {tabsBar}
      {tab === 'materi' && <MaterialsTab assignmentId={a.id} />}
      {tab === 'tugas' && <TasksTab assignmentId={a.id} />}
      {tab === 'nilai' && <GradebookTab assignment={a} />}
      {tab === 'siswa' && <StudentsTab classroomId={a.classroom} />}
    </>
  )
}
