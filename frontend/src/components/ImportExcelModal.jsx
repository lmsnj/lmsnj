import { useState } from 'react'
import { adminImportApi } from '../api/academics'
import { getErrorMessage, getFieldErrors } from '../utils/errors'
import Alert from './Alert'
import Badge from './Badge'
import Button from './Button'
import FileDownloadButton from './FileDownloadButton'
import FileInput from './FileInput'
import Modal from './Modal'

/**
 * Impor data admin dari Excel (mata pelajaran, kelas, pengampu): unduh template -> periksa ->
 * impor jika semua baris benar. `columns`: [{ key, header }] untuk tabel pratinjau.
 */
export default function ImportExcelModal({
  kind,
  title,
  description,
  templateName,
  columns,
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
      const data = await adminImportApi.run(kind, file, dryRun)
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
              Impor {preview.summary.total} Baris
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{description}</p>
        <FileDownloadButton fetchBlob={() => adminImportApi.template(kind)} filename={templateName}>
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
          hint="Belum ada data yang disimpan sampai Anda menekan tombol Impor."
        />
        <Alert type="error">{error}</Alert>
        {preview && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge color="gray">{preview.summary.total} baris</Badge>
              <Badge color="green">{preview.summary.valid} siap</Badge>
              {preview.summary.invalid > 0 && (
                <Badge color="red">{preview.summary.invalid} salah</Badge>
              )}
            </div>
            <div className="max-h-80 overflow-auto rounded-lg ring-1 ring-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Baris</th>
                    {columns.map((c) => (
                      <th key={c.key} className="px-3 py-2">
                        {c.header}
                      </th>
                    ))}
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((row) => (
                    <tr key={row.row} className={row.errors.length ? 'bg-red-50/60' : ''}>
                      <td className="px-3 py-2 text-slate-500">{row.row}</td>
                      {columns.map((c) => (
                        <td key={c.key} className="px-3 py-2">
                          {row[c.key] || '-'}
                        </td>
                      ))}
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
