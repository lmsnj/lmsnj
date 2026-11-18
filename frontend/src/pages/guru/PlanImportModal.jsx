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
 * Impor/ubah Bab, Materi, dan Tugas satu kelas-mapel sekaligus lewat Excel ("Rencana Pembelajaran").
 * Template sudah berisi data kelas-mapel ini (atau contoh jika masih kosong) -> isi/ubah -> Periksa ->
 * Impor. Judul sama = diperbarui, judul baru = dibuat (aturan di backend `plan_excel.py`).
 * `onImported(teks)` dipanggil setelah berhasil disimpan.
 */
export default function PlanImportModal({ assignmentId, onClose, onImported }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  const run = async (dryRun) => {
    setBusy(dryRun ? 'check' : 'import')
    setError('')
    try {
      const data = await materialsApi.importPlan(assignmentId, file, dryRun)
      if (dryRun) setPreview(data)
      else {
        const { created, updated } = data.created
        onImported(`Rencana pembelajaran diimpor: ${created} data baru, ${updated} diperbarui.`)
      }
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
      title="Impor Bab, Materi & Tugas"
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
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">
          Isi banyak bab, materi (video/link), dan tugas sekaligus tanpa mengisi form satu per satu.
          Template berisi data kelas ini (atau contoh jika masih kosong) di lembar{' '}
          <strong>Bab</strong>, <strong>Materi</strong>, dan <strong>Tugas</strong>.
        </p>
        <ul className="list-disc space-y-1 rounded-lg bg-slate-50 p-3 pl-7 text-slate-700 ring-1 ring-slate-200">
          <li>Judul yang sama dengan yang sudah ada = diperbarui; judul baru = dibuat.</li>
          <li>Tidak ada yang dihapus. Urutan baris = urutan bab & materi.</li>
          <li>File yang sama bisa diimpor ke kelas lain dengan mapel yang sama.</li>
          <li>File PDF materi & lampiran tugas tetap diunggah lewat form.</li>
        </ul>
        <FileDownloadButton
          fetchBlob={() => materialsApi.planTemplate(assignmentId)}
          filename="Rencana Pembelajaran.xlsx"
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
          hint="Semua baris harus benar; jika ada yang salah, tidak ada yang disimpan."
        />
        <Alert type="error">{error}</Alert>
        {preview && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge color="gray">{preview.summary.total} baris</Badge>
              <Badge color="green">{preview.summary.valid} siap</Badge>
              {preview.summary.invalid > 0 && (
                <Badge color="red">{preview.summary.invalid} salah</Badge>
              )}
            </div>
            <div className="max-h-80 overflow-auto rounded-lg ring-1 ring-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Lembar</th>
                    <th className="px-3 py-2">Baris</th>
                    <th className="px-3 py-2">Judul</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((row) => (
                    <tr
                      key={`${row.sheet}-${row.row}`}
                      className={row.errors.length ? 'bg-red-50/60' : ''}
                    >
                      <td className="px-3 py-2 text-slate-500">{row.sheet}</td>
                      <td className="px-3 py-2 text-slate-500">{row.row}</td>
                      <td className="max-w-xs truncate px-3 py-2" title={row.title}>
                        {row.title || '-'}
                      </td>
                      <td className="px-3 py-2">
                        {row.errors.length ? (
                          <ul className="list-disc pl-4 text-xs text-red-700">
                            {row.errors.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        ) : (
                          <Badge color={row.action === 'baru' ? 'green' : 'blue'}>
                            {row.action === 'baru' ? 'Baru' : 'Diperbarui'}
                          </Badge>
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
