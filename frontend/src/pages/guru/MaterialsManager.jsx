import { useState } from 'react'
import { materialsApi } from '../../api/materials'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import DeleteDialog from '../../components/DeleteDialog'
import MaterialList from '../../components/MaterialList'
import MaterialViewer from '../../components/MaterialViewer'
import useFetch from '../../hooks/useFetch'
import { ALL } from '../../utils/academic'
import { getErrorMessage } from '../../utils/errors'
import MaterialFormModal from './MaterialFormModal'

/**
 * Daftar + kelola materi guru. Dipakai di tab "Materi" halaman kelas-mapel (assignmentId tetap)
 * dan di halaman "Materi Pembelajaran" (assignmentId kosong = semua kelas, showContext = tampilkan
 * mapel & kelas di setiap materi). `openForm` = langsung buka form tambah (dari tombol Beranda).
 */
export default function MaterialsManager({ assignmentId, showContext, openForm = false }) {
  const [notice, setNotice] = useState({ type: 'success', text: '' })
  // { type: 'form' | 'view' | 'delete', material }
  const [dialog, setDialog] = useState(openForm ? { type: 'form', material: null } : null)
  const materials = useFetch(materialsApi.list, {
    ...ALL,
    teaching_assignment: assignmentId || undefined,
  })

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
        showContext={showContext}
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
