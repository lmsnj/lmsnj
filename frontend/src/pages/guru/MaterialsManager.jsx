import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  Copy,
  FileSpreadsheet,
  Layers,
  ListChecks,
  Merge,
  PencilLine,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import { chaptersApi, materialsApi } from '../../api/materials'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import DeleteDialog from '../../components/DeleteDialog'
import MaterialList from '../../components/MaterialList'
import MaterialViewer from '../../components/MaterialViewer'
import useFetch from '../../hooks/useFetch'
import { ALL } from '../../utils/academic'
import { getErrorMessage } from '../../utils/errors'
import { groupByChapter, moveItem } from '../../utils/learningPath'
import ChaptersModal from './ChaptersModal'
import CopyMaterialsModal from './CopyMaterialsModal'
import GenerateAssessmentModal from './GenerateAssessmentModal'
import MaterialFormModal from './MaterialFormModal'
import MaterialItemsModal from './MaterialItemsModal'
import MaterialProgressModal from './MaterialProgressModal'
import MergeMaterialModal from './MergeMaterialModal'
import ObjectiveQuizImportModal from './ObjectiveQuizImportModal'
import PlanImportModal from './PlanImportModal'
import PracticeImportModal from './PracticeImportModal'

// Bab hanya dimuat di halaman satu kelas-mapel.
const listChapters = (params) =>
  params.teaching_assignment ? chaptersApi.list(params) : Promise.resolve({ results: [] })

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
  // { type: 'form' | 'items' | 'practice' | 'chapters' | 'plan' | 'copy' | 'merge' | 'view' | 'delete' | 'progress' |
  //   'ai' | 'quiz', material }
  const [dialog, setDialog] = useState(openForm ? { type: 'form', material: null } : null)
  const materials = useFetch(materialsApi.list, {
    ...ALL,
    teaching_assignment: assignmentId || undefined,
  })

  const chapters = useFetch(listChapters, { ...ALL, teaching_assignment: assignmentId || null })

  const closeDialog = () => setDialog(null)
  const all = materials.data?.results
  const shown = filter && all ? filter(all) : all

  // Urutan hanya bisa diatur di halaman satu kelas-mapel (daftarnya lengkap & tidak disaring).
  const canReorder = Boolean(assignmentId) && !filter
  const chapterList = chapters.data?.results ?? []
  // Ada bab: materi ditampilkan per bab (urutan sama dengan yang dilihat siswa).
  const groups = canReorder && all && chapterList.length ? groupByChapter(all, chapterList) : null
  // Pindahkan materi di dalam daftarnya (satu bab, atau semua materi jika tanpa bab).
  const move = async (list, index, delta) => {
    const moved = moveItem(list, index, delta)
    const ordered = groups
      ? groups.flatMap((group) => (group.materials === list ? moved : group.materials))
      : moved
    const ids = ordered.map((m) => m.id)
    try {
      await materialsApi.reorder(assignmentId, ids)
      materials.reload()
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err) })
    }
  }

  // Tombol per materi; `list` = daftar tempat materi itu berada (untuk tombol naik/turun).
  const renderActions = (list) => (material) => (
    <>
      {canReorder && (
        <>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Naikkan urutan ${material.title}`}
            disabled={list.indexOf(material) === 0}
            onClick={() => move(list, list.indexOf(material), -1)}
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Turunkan urutan ${material.title}`}
            disabled={list.indexOf(material) === list.length - 1}
            onClick={() => move(list, list.indexOf(material), 1)}
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
        <Layers className="size-4" aria-hidden="true" />
        {` Konten (${1 + (material.items?.length ?? 0)})`}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setDialog({ type: 'practice', material })}
        title="Latihan Pemahaman: soal setelah siswa membuka semua konten materi"
      >
        <PencilLine className="size-4" aria-hidden="true" /> Latihan
        {material.practice_count > 0 && ` (${material.practice_count})`}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setDialog({ type: 'progress', material })}>
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
      {canReorder && all?.length > 1 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDialog({ type: 'merge', material })}
          title="Gabungkan materi kembar (mis. diunggah dua guru) ke materi ini"
        >
          <Merge className="size-4" aria-hidden="true" /> Gabungkan
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="text-red-600 hover:bg-red-50"
        onClick={() => setDialog({ type: 'delete', material })}
      >
        Hapus
      </Button>
    </>
  )

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
            {canReorder &&
              ' Guru lain yang mengampu mapel ini di kelas yang sama memakai daftar materi yang sama: cukup tambahkan materi berikutnya.'}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {canReorder && all?.length > 0 && (
            <Button variant="secondary" onClick={() => setDialog({ type: 'copy' })}>
              <Copy className="size-4" aria-hidden="true" /> Salin ke Kelas Lain
            </Button>
          )}
          {canReorder && (
            <Button variant="secondary" onClick={() => setDialog({ type: 'plan' })}>
              <FileSpreadsheet className="size-4" aria-hidden="true" /> Impor Excel
            </Button>
          )}
          {canReorder && (
            <Button variant="secondary" onClick={() => setDialog({ type: 'chapters' })}>
              <BookOpen className="size-4" aria-hidden="true" /> Bab
              {chapterList.length > 0 && ` (${chapterList.length})`}
            </Button>
          )}
          <Button onClick={() => setDialog({ type: 'form', material: null })}>
            + Tambah Materi
          </Button>
        </div>
      </div>

      <div className="mb-3 space-y-3">
        <Alert type={notice.type}>{notice.text}</Alert>
        <Alert type="error">{materials.error}</Alert>
      </div>

      {groups ? (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.chapter?.id ?? 'tanpa-bab'}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold text-slate-900">
                  {group.chapter
                    ? `Bab ${chapterList.indexOf(group.chapter) + 1}: ${group.chapter.title}`
                    : 'Pengantar (tanpa bab)'}
                </h3>
                {group.chapter && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <ClipboardCheck className="size-3.5" aria-hidden="true" />
                    {group.chapter.post_test
                      ? `Post Test: ${group.chapter.post_test_title}${group.chapter.post_test_published ? '' : ' (draf)'}`
                      : 'Tanpa Post Test'}
                  </span>
                )}
              </div>
              <MaterialList
                materials={group.materials}
                showStatus
                numbered
                emptyTitle="Belum ada materi di bab ini. Pilih bab ini di form materi."
                onOpen={(material) => setDialog({ type: 'view', material })}
                actions={renderActions(group.materials)}
              />
            </section>
          ))}
        </div>
      ) : (
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
          actions={renderActions(all)}
        />
      )}

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
      {dialog?.type === 'chapters' && (
        <ChaptersModal
          assignmentId={assignmentId}
          onClose={closeDialog}
          onChanged={() => {
            chapters.reload()
            materials.reload()
          }}
        />
      )}
      {dialog?.type === 'plan' && (
        <PlanImportModal
          assignmentId={assignmentId}
          onClose={closeDialog}
          onImported={(text) => {
            closeDialog()
            setNotice({ type: 'success', text })
            chapters.reload()
            materials.reload()
          }}
        />
      )}
      {dialog?.type === 'copy' && (
        <CopyMaterialsModal
          assignmentId={assignmentId}
          materials={groups ? groups.flatMap((group) => group.materials) : all}
          onClose={closeDialog}
          onCopied={(text) => {
            closeDialog()
            setNotice({ type: 'success', text })
          }}
        />
      )}
      {dialog?.type === 'merge' && (
        <MergeMaterialModal
          material={dialog.material}
          materials={all}
          onClose={closeDialog}
          onMerged={(text) => {
            closeDialog()
            setNotice({ type: 'success', text })
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
      {dialog?.type === 'practice' && (
        <PracticeImportModal
          material={dialog.material}
          onClose={closeDialog}
          onChanged={(text) => {
            closeDialog()
            setNotice({ type: 'success', text })
            materials.reload()
          }}
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
