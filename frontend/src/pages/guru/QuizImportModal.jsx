import { useState } from 'react'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import FileDownloadButton from '../../components/FileDownloadButton'
import FileInput from '../../components/FileInput'
import Modal from '../../components/Modal'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'

/**
 * Pola impor soal kuis materi dari Excel: unduh template (sudah berisi soal yang ada beserta
 * kuncinya) -> isi/ubah -> Periksa -> Impor. Dipakai Kuis Capaian dan Latihan Pemahaman.
 * `importFile(file, dryRun)` memanggil API; `showObjective` = tampilkan kolom No Capaian di
 * pratinjau; `children` = keterangan di atas tombol template; `actions` = tombol tambahan di kaki.
 */
export default function QuizImportModal({
  title,
  templateFilename,
  fetchTemplate,
  importFile,
  hint,
  showObjective = false,
  actions,
  children,
  onClose,
  onImported,
}) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  const run = async (dryRun) => {
    setBusy(dryRun ? 'check' : 'import')
    setError('')
    try {
      const data = await importFile(file, dryRun)
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
      title={title}
      onClose={onClose}
      footer={
        <>
          {actions}
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
        {children}
        <FileDownloadButton fetchBlob={fetchTemplate} filename={templateFilename}>
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
          hint={hint}
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
                    {showObjective && <th className="px-3 py-2">Capaian</th>}
                    <th className="px-3 py-2">Jenis</th>
                    <th className="px-3 py-2">Pertanyaan</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((row) => (
                    <tr key={row.row} className={row.errors.length ? 'bg-red-50/60' : ''}>
                      <td className="px-3 py-2 text-slate-500">{row.row}</td>
                      {showObjective && <td className="px-3 py-2">{row.objective || '-'}</td>}
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
