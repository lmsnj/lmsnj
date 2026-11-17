import { materialsApi } from '../../api/materials'
import QuizImportModal from './QuizImportModal'

/**
 * Impor kuis per capaian dari Excel. Capaian yang ada di file diganti soalnya; capaian lain tetap.
 */
export default function ObjectiveQuizImportModal({ material, onClose, onImported }) {
  const counts = material.objective_quiz ?? []
  return (
    <QuizImportModal
      title={`Kuis Capaian: ${material.title}`}
      templateFilename={`Kuis Capaian - ${material.title}.xlsx`}
      fetchTemplate={() => materialsApi.objectiveQuizTemplate(material.id)}
      importFile={(file, dryRun) => materialsApi.importObjectiveQuiz(material.id, file, dryRun)}
      hint="Capaian yang ada di file diganti seluruh soalnya; capaian yang tidak ada di file tidak berubah."
      showObjective
      onClose={onClose}
      onImported={onImported}
    >
      <p className="text-slate-600">
        Setiap capaian boleh punya 1–5 soal (pilihan ganda, isian, tarik & lepas, jodohkan). Siswa
        harus menjawab benar semua agar capaian itu tercapai. Template berikut sudah berisi kuis
        yang ada beserta kuncinya, jadi bisa dipakai untuk menambah maupun mengubah soal.
      </p>
      <ol className="list-decimal space-y-0.5 rounded-lg bg-slate-50 py-2 pr-3 pl-8 text-slate-700 ring-1 ring-slate-200">
        {material.objectives.map((text, index) => (
          <li key={text}>
            {text}{' '}
            <span className={counts[index] ? 'text-brand-700' : 'text-slate-400'}>
              ({counts[index] ? `${counts[index]} soal` : 'belum ada kuis'})
            </span>
          </li>
        ))}
      </ol>
    </QuizImportModal>
  )
}
