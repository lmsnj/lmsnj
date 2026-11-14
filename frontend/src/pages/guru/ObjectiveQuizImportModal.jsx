import { useState } from 'react'
import { materialsApi } from '../../api/materials'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import FileDownloadButton from '../../components/FileDownloadButton'
import FileInput from '../../components/FileInput'
import Modal from '../../components/Modal'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'

/**
 * Impor kuis per capaian dari Excel: unduh template (sudah berisi kuis yang ada beserta kuncinya)
 * -> isi/ubah -> Periksa -> Impor. Capaian yang ada di file diganti soalnya; capaian lain tetap.
 */
export default function ObjectiveQuizImportModal({ material, onClose, onImported }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const counts = material.objective_quiz ?? []

  const run = async (dryRun) => {
    setBusy(dryRun ? 'check' : 'import')
    setError('')
    try {
      const data = await materialsApi.importObjectiveQuiz(material.id, file, dryRun)
      if (dryRun) setPreview(data)
      else onImported(data.created)
    } catch (err) {
      if (err.response?.data?.rows) setPreview(err.response.data)
      setError(getFieldErrors(err).file ?? getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const ready = preview && preview.summary.invalid === 0
  return (
    <Modal
      open
      size="lg"
      title={`Kuis Capaian: ${material.title}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          <Button
            variant={ready ? 'secondary' : 'primary'}
            disabled={!file}
            loading={busy === 'check'}
            onClick={() => run(true)}
          >
            Periksa
          </Button>
          {ready && (
            <Button loading={busy === 'import'} onClick={() => run(false)}>
              Impor {preview.summary.total} Soal
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-sm">
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
        <FileDownloadButton
          fetchBlob={() => materialsApi.objectiveQuizTemplate(material.id)}
          filename={`Kuis Capaian - ${material.title}.xlsx`}
        >
          Unduh Template Excel
        </FileDownloadButton>
        <FileInput
          label="File Excel yang sudah diisi"
          accept=".xlsx"
          onChange={(chosen) => {
            setFile(chosen)
            setPreview(null)
            setError('')
          }}
          hint="Capaian yang ada di file diganti seluruh soalnya; capaian yang tidak ada di file tidak berubah."
        />
        <Alert type="error">{error}</Alert>
        {preview && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge color="gray">{preview.summary.total} soal</Badge>
              <Badge color="green">{preview.summary.valid} siap</Badge>
              {preview.summary.invalid > 0 && (
                <Badge color="red">{preview.summary.invalid} salah</Badge>
              )}
            </div>
            <div className="max-h-80 overflow-auto rounded-lg ring-1 ring-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Baris</th>
                    <th className="px-3 py-2">Capaian</th>
                    <th className="px-3 py-2">Jenis</th>
                    <th className="px-3 py-2">Pertanyaan</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((row) => (
                    <tr key={row.row} className={row.errors.length ? 'bg-red-50/60' : ''}>
                      <td className="px-3 py-2 text-slate-500">{row.row}</td>
                      <td className="px-3 py-2">{row.objective || '-'}</td>
                      <td className="px-3 py-2">{row.kind || '-'}</td>
                      <td className="max-w-xs truncate px-3 py-2" title={row.text}>
                        {row.text || '-'}
                      </td>
                      <td className="px-3 py-2">
                        {row.errors.length ? (
                          <ul className="list-disc pl-4 text-xs text-red-700">
                            {row.errors.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        ) : (
                          <Badge color="green">Siap</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
