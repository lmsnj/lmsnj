import { useState } from 'react'
import { timetableApi } from '../api/timetable'
import { getErrorMessage, getFieldErrors } from '../utils/errors'
import { importSummary } from '../utils/timetable'
import AccountList from './AccountList'
import Alert from './Alert'
import Button from './Button'
import FileDownloadButton from './FileDownloadButton'
import FileInput from './FileInput'
import Modal from './Modal'

function Summary({ report }) {
  return (
    <dl className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
      {importSummary(report).map((line) => (
        <div key={line.label} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="font-medium text-slate-700">{line.label}</dt>
          <dd className="text-slate-600">{line.value}</dd>
        </div>
      ))}
    </dl>
  )
}

// Akun guru baru dari impor; password hanya ada setelah impor sungguhan (bukan saat Periksa).
function newTeacherAccounts(report) {
  return report.teachers.created.map((teacher) => ({
    full_name: teacher.name,
    username: teacher.username,
    classroom: '',
    password: teacher.password,
  }))
}

/**
 * Impor jadwal pelajaran dari Excel: unduh template -> Periksa (tidak ada yang disimpan) -> Impor.
 * Aturannya sama dengan perintah import_timetable: satu masalah = tidak ada yang disimpan.
 */
export default function TimetableImportModal({ onClose, onImported }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [problems, setProblems] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)

  const run = async (dryRun) => {
    setBusy(dryRun ? 'check' : 'import')
    setError('')
    setProblems([])
    try {
      const report = await timetableApi.importRun(file, dryRun)
      if (dryRun) {
        setPreview(report)
      } else {
        setResult(report)
        onImported()
      }
    } catch (err) {
      setPreview(null)
      setProblems(err.response?.data?.errors ?? [])
      setError(getFieldErrors(err).file ?? getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (result) {
    const accounts = newTeacherAccounts(result)
    return (
      <Modal
        open
        size="lg"
        title="Jadwal Berhasil Diimpor"
        onClose={onClose}
        footer={<Button onClick={onClose}>Selesai</Button>}
      >
        <div className="space-y-4">
          <Summary report={result} />
          {accounts.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-slate-900">Akun guru baru</h3>
              <AccountList accounts={accounts} />
            </div>
          )}
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      size="lg"
      title="Impor Jadwal dari Excel"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          <Button
            variant={preview ? 'secondary' : 'primary'}
            disabled={!file}
            loading={busy === 'check'}
            onClick={() => run(true)}
          >
            Periksa
          </Button>
          {preview && (
            <Button loading={busy === 'import'} onClick={() => run(false)}>
              Impor Jadwal
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Isi lembar Info, Slot Waktu, Jadwal, Guru, dan Mapel (Distribusi JP opsional). Mapel,
          kelas, akun guru, dan pengampu yang belum ada dibuat otomatis. Kode jadwal yang sama
          mengganti isi jadwal itu; kode baru menjadi versi baru dan langsung jadi jadwal aktif.
        </p>
        <FileDownloadButton
          fetchBlob={timetableApi.importTemplate}
          filename="Template Impor Jadwal.xlsx"
        >
          Unduh Template Excel
        </FileDownloadButton>
        <FileInput
          label="File Excel yang sudah diisi"
          accept=".xlsx"
          onChange={(chosen) => {
            setFile(chosen)
            setPreview(null)
            setProblems([])
            setError('')
          }}
          hint="Belum ada data yang disimpan sampai Anda menekan tombol Impor Jadwal."
        />
        <Alert type="error">{error}</Alert>
        {problems.length > 0 && (
          <ul className="max-h-64 list-disc space-y-1 overflow-y-auto rounded-lg bg-red-50 py-3 pr-3 pl-7 text-sm text-red-700 ring-1 ring-red-200">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
        {preview && (
          <div className="space-y-2">
            <Alert type="success">
              File benar. Periksa ringkasan di bawah, lalu tekan Impor Jadwal.
            </Alert>
            <Summary report={preview} />
            {preview.teachers.created.length > 0 && (
              <p className="text-sm text-slate-600">
                Akun guru baru:{' '}
                {preview.teachers.created
                  .map((teacher) => `${teacher.name} (${teacher.username})`)
                  .join(', ')}
                . Password ditampilkan setelah impor.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
