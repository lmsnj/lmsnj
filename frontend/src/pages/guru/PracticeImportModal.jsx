import { useState } from 'react'
import { materialsApi } from '../../api/materials'
import Button from '../../components/Button'
import DeleteDialog from '../../components/DeleteDialog'
import PracticeQuiz from '../../components/PracticeQuiz'
import QuizImportModal from './QuizImportModal'

/**
 * Latihan Pemahaman satu materi: impor/ubah soal lewat Excel (isi file MENGGANTI seluruh soal),
 * coba sebagai siswa (pratinjau, tidak disimpan), atau hapus latihan. `onChanged(teks)` dipanggil
 * setelah latihan diimpor/dihapus.
 */
export default function PracticeImportModal({ material, onClose, onChanged }) {
  const count = material.practice_count ?? 0
  // null | 'preview' | 'delete'
  const [dialog, setDialog] = useState(null)

  return (
    <>
      <QuizImportModal
        title={`Latihan Pemahaman: ${material.title}`}
        templateFilename={`Latihan Pemahaman - ${material.title}.xlsx`}
        fetchTemplate={() => materialsApi.practiceTemplate(material.id)}
        importFile={(file, dryRun) => materialsApi.importPractice(material.id, file, dryRun)}
        hint="Isi file menggantikan seluruh soal Latihan Pemahaman materi ini."
        actions={
          count > 0 && (
            <>
              <Button
                variant="ghost"
                className="text-red-600 hover:bg-red-50"
                onClick={() => setDialog('delete')}
              >
                Hapus Latihan
              </Button>
              <Button variant="secondary" onClick={() => setDialog('preview')}>
                Coba Latihan
              </Button>
            </>
          )
        }
        onClose={onClose}
        onImported={(created) =>
          onChanged(`${created} soal Latihan Pemahaman "${material.title}" diimpor.`)
        }
      >
        <p className="text-slate-600">
          Latihan Pemahaman dikerjakan siswa setelah membuka semua konten materi, satu soal per
          layar. Siswa harus menjawab benar semua (boleh mengulang) sebelum menulis Cerita
          Reflektif. Isi 1–10 soal: pilihan ganda, isian, tarik & lepas, atau jodohkan.
        </p>
        <p className="rounded-lg bg-slate-50 p-3 text-slate-700 ring-1 ring-slate-200">
          {count > 0
            ? `Saat ini: ${count} soal. Template berikut sudah berisi soal tersebut beserta kuncinya.`
            : 'Materi ini belum punya Latihan Pemahaman.'}
        </p>
      </QuizImportModal>
      {dialog === 'preview' && (
        <PracticeQuiz material={material} preview onClose={() => setDialog(null)} />
      )}
      <DeleteDialog
        item={dialog === 'delete' ? material : null}
        title="Hapus Latihan Pemahaman"
        message={(m) =>
          `Hapus Latihan Pemahaman materi "${m.title}"? Siswa tidak perlu lagi mengerjakannya.`
        }
        onDelete={(m) => materialsApi.setPractice(m.id, [])}
        onDeleted={(m) => onChanged(`Latihan Pemahaman "${m.title}" dihapus.`)}
        onClose={() => setDialog(null)}
      />
    </>
  )
}
