import { ArrowDown, ArrowUp, ClipboardList, Layers, ListChecks, Sparkles } from 'lucide-react'
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
import { moveItem } from '../../utils/learningPath'
import GenerateAssessmentModal from './GenerateAssessmentModal'
import MaterialFormModal from './MaterialFormModal'
import MaterialItemsModal from './MaterialItemsModal'
import MaterialProgressModal from './MaterialProgressModal'
import ObjectiveQuizImportModal from './ObjectiveQuizImportModal'

/**
 * Daftar + kelola materi guru. Dipakai di tab "Materi" halaman kelas-mapel (assignmentId tetap)
 * dan di halaman "Materi Pembelajaran" (assignmentId kosong = semua kelas, showContext = tampilkan
 * mapel & kelas di setiap materi). `openForm` = langsung buka form tambah (dari tombol Beranda).
 * Opsional untuk halaman "Materi Pembelajaran": `filter(materi)` menyaring daftar di browser,
 * `header(semuaMateri)` tampil paling atas, `summary(jumlahTampil)` menggantikan teks di kiri tombol.
 */
export default function MaterialsManager({
  assignmentId,
  showContext,
  openForm = false,
  filter,
  header,
  summary,
}) {
  const [notice, setNotice] = useState({ type: 'success', text: '' })
  // { type: 'form' | 'items' | 'view' | 'delete' | 'progress' | 'ai' | 'quiz', material }
  const [dialog, setDialog] = useState(openForm ? { type: 'form', material: null } : null)
  const materials = useFetch(materialsApi.list, {
    ...ALL,
    teaching_assignment: assignmentId || undefined,
  })

  const closeDialog = () => setDialog(null)
  const all = materials.data?.results
  const shown = filter && all ? filter(all) : all

  // Urutan hanya bisa diatur di halaman satu kelas-mapel (daftarnya lengkap & tidak disaring).
  const canReorder = Boolean(assignmentId) && !filter
  const move = async (index, delta) => {
    const ids = moveItem(all, index, delta).map((m) => m.id)
    try {
      await materialsApi.reorder(assignmentId, ids)
      materials.reload()
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err) })
    }
  }

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
      {header?.(all ?? [])}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {summary ? (
          summary(shown?.length ?? 0)
        ) : (
          <p className="text-sm text-slate-600">
            Materi berstatus <strong>Draf</strong> tidak terlihat oleh siswa.
            {canReorder &&
              ' Siswa membuka materi sesuai urutan; materi berikutnya terbuka setelah capaian sebelumnya terpenuhi.'}
          </p>
        )}
        <Button onClick={() => setDialog({ type: 'form', material: null })}>+ Tambah Materi</Button>
      </div>

      <div className="mb-3 space-y-3">
        <Alert type={notice.type}>{notice.text}</Alert>
        <Alert type="error">{materials.error}</Alert>
      </div>

      <MaterialList
        materials={shown}
        loading={materials.loading}
        showStatus
        numbered={canReorder}
        showContext={showContext}
        emptyTitle={
          all?.length
            ? 'Tidak ada materi yang cocok.'
            : 'Belum ada materi. Klik “Tambah Materi” untuk mulai.'
        }
        emptyMessage={all?.length ? 'Coba kata kunci lain atau hapus penyaring.' : undefined}
        onOpen={(material) => setDialog({ type: 'view', material })}
        actions={(material) => (
          <>
            {canReorder && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Naikkan urutan ${material.title}`}
                  disabled={all.indexOf(material) === 0}
                  onClick={() => move(all.indexOf(material), -1)}
                >
                  <ArrowUp className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Turunkan urutan ${material.title}`}
                  disabled={all.indexOf(material) === all.length - 1}
                  onClick={() => move(all.indexOf(material), 1)}
                >
                  <ArrowDown className="size-4" aria-hidden="true" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDialog({ type: 'items', material })}
              title="Tambah video, PDF, atau link lain ke materi ini"
            >
              <Layers className="size-4" aria-hidden="true" /> Konten (
              {1 + (material.items?.length ?? 0)})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDialog({ type: 'progress', material })}
            >
              <ListChecks className="size-4" aria-hidden="true" /> Progres
            </Button>
            {material.objectives?.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDialog({ type: 'quiz', material })}
                title="Impor atau ubah kuis per capaian lewat Excel"
              >
                <ClipboardList className="size-4" aria-hidden="true" /> Kuis Capaian
                {material.objective_quiz?.some(Boolean) &&
                  ` (${material.objective_quiz.filter(Boolean).length}/${material.objectives.length})`}
              </Button>
            )}
            {(material.concepts?.length > 0 || material.objectives?.length > 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDialog({ type: 'ai', material })}
                title="Buat asesmen cek pemahaman otomatis dari konsep kunci materi"
              >
                <Sparkles className="size-4" aria-hidden="true" /> Asesmen Otomatis
              </Button>
            )}
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
      {dialog?.type === 'items' && (
        <MaterialItemsModal
          material={dialog.material}
          onClose={closeDialog}
          onChanged={() => materials.reload()}
        />
      )}
      {dialog?.type === 'progress' && (
        <MaterialProgressModal material={dialog.material} onClose={closeDialog} />
      )}
      {dialog?.type === 'quiz' && (
        <ObjectiveQuizImportModal
          material={dialog.material}
          onClose={closeDialog}
          onImported={(count) => {
            closeDialog()
            setNotice({
              type: 'success',
              text: `${count} soal kuis capaian "${dialog.material.title}" diimpor.`,
            })
            materials.reload()
          }}
        />
      )}
      {dialog?.type === 'ai' && (
        <GenerateAssessmentModal
          material={dialog.material}
          onClose={closeDialog}
          onCreated={() => materials.reload()}
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
