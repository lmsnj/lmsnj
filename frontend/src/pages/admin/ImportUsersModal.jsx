import { useState } from 'react'
import { usersApi } from '../../api/users'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import FileDownloadButton from '../../components/FileDownloadButton'
import FileInput from '../../components/FileInput'
import Modal from '../../components/Modal'
import { ROLE_LABELS } from '../../utils/constants'
import { toCsvBlob } from '../../utils/csv'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'

function Step({ number, title, children }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">{title}</p>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  )
}

function PreviewTable({ rows }) {
  return (
    <div className="max-h-80 overflow-auto rounded-lg ring-1 ring-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold text-slate-500">
          <tr>
            <th className="px-3 py-2">Baris</th>
            <th className="px-3 py-2">Nama</th>
            <th className="px-3 py-2">Username</th>
            <th className="px-3 py-2">Peran</th>
            <th className="px-3 py-2">Kelas</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.row} className={row.errors.length ? 'bg-red-50/60' : ''}>
              <td className="px-3 py-2 text-slate-500">{row.row}</td>
              <td className="px-3 py-2 font-medium text-slate-900">{row.full_name || '-'}</td>
              <td className="px-3 py-2">{row.username || '-'}</td>
              <td className="px-3 py-2">{ROLE_LABELS[row.role] ?? '-'}</td>
              <td className="px-3 py-2">{row.classroom || '-'}</td>
              <td className="px-3 py-2">
                {row.errors.length ? (
                  <ul className="list-disc pl-4 text-xs text-red-700">
                    {row.errors.map((error) => (
                      <li key={error}>{error}</li>
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
  )
}

/**
 * Impor pengguna dari Excel dalam 3 langkah: unduh template -> periksa file -> impor.
 * Password hanya ditampilkan sekali setelah impor, jadi admin diingatkan untuk mengunduhnya.
 */
export default function ImportUsersModal({ onClose, onImported }) {
  const [file, setFile] = useState(null)
  // Dipasang ulang saat pilih file lagi, agar isian file bisa dipilih ulang.
  const [fileKey, setFileKey] = useState(0)
  const [preview, setPreview] = useState(null)
  const [accounts, setAccounts] = useState(null)
  const [busy, setBusy] = useState(null) // 'check' | 'import'
  const [error, setError] = useState('')
  const [downloaded, setDownloaded] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const send = async (dryRun) => {
    setBusy(dryRun ? 'check' : 'import')
    setError('')
    try {
      const data = await usersApi.importFile(file, dryRun)
      if (dryRun) setPreview(data)
      else {
        setAccounts(data.accounts)
        onImported(data.accounts.length)
      }
    } catch (err) {
      const body = err.response?.data
      if (body?.rows) setPreview(body) // data berubah sejak diperiksa; tampilkan baris yang salah
      setError(getFieldErrors(err).file ?? getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const chooseAgain = () => {
    setFile(null)
    setPreview(null)
    setError('')
    setFileKey((key) => key + 1)
  }

  const accountsCsv = () =>
    toCsvBlob(
      ['No', 'Nama', 'Username', 'Peran', 'Kelas', 'Password'],
      accounts.map((a, index) => [
        index + 1,
        a.full_name,
        a.username,
        ROLE_LABELS[a.role],
        a.classroom,
        a.password,
      ]),
    )

  const handleClose = () => {
    if (accounts && !downloaded && !confirmClose) {
      setConfirmClose(true)
      return
    }
    onClose()
  }

  const summary = preview?.summary
  const ready = summary && summary.invalid === 0

  return (
    <Modal open title="Impor Pengguna dari Excel" onClose={handleClose} size="lg">
      {accounts ? (
        <div className="space-y-4">
          <Alert type="success">
            <strong>{accounts.length} pengguna berhasil diimpor.</strong>
          </Alert>
          <Alert type="info">
            Password <strong>hanya ditampilkan sekali ini</strong>. Unduh daftar akun sekarang lalu
            bagikan ke guru/siswa. Minta mereka mengganti password setelah login (menu Profil Saya).
            Simpan file ini di tempat aman.
          </Alert>
          <div className="flex flex-wrap gap-2">
            <FileDownloadButton
              fetchBlob={async () => accountsCsv()}
              filename="Daftar Akun.csv"
              onDownloaded={() => setDownloaded(true)}
            >
              Unduh Daftar Akun & Password (Excel/CSV)
            </FileDownloadButton>
            <Button variant="secondary" onClick={handleClose}>
              Selesai
            </Button>
          </div>
          {confirmClose && !downloaded && (
            <Alert type="error">
              Daftar password belum diunduh. Jika ditutup, password otomatis tidak bisa dilihat lagi
              (harus direset satu per satu). Klik <strong>Selesai</strong> sekali lagi untuk tetap
              menutup.
            </Alert>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <Step number={1} title="Unduh template dan isi data">
            <p className="mb-2 text-sm text-slate-600">
              Isi di lembar <strong>Pengguna</strong>. Petunjuk lengkap ada di lembar Petunjuk.
              Password dan username siswa boleh dikosongkan.
            </p>
            <FileDownloadButton
              fetchBlob={usersApi.importTemplate}
              filename="Template Impor Pengguna.xlsx"
            >
              Unduh Template Excel
            </FileDownloadButton>
          </Step>

          <Step number={2} title="Unggah file untuk diperiksa">
            <p className="mb-2 text-sm text-slate-600">
              Belum ada data yang disimpan pada langkah ini.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <FileInput
                  key={fileKey}
                  accept=".xlsx"
                  onChange={(chosen) => {
                    setFile(chosen)
                    setPreview(null)
                    setError('')
                  }}
                  hint="File Excel .xlsx, maksimal 1000 baris."
                />
              </div>
              <Button disabled={!file} loading={busy === 'check'} onClick={() => send(true)}>
                Periksa File
              </Button>
            </div>
          </Step>

          <Alert type="error">{error}</Alert>

          {preview && (
            <Step number={3} title="Periksa hasil lalu impor">
              <div className="mb-3 flex flex-wrap gap-2 text-sm">
                <Badge color="gray">{summary.total} baris</Badge>
                <Badge color="green">{summary.valid} siap</Badge>
                {summary.invalid > 0 && <Badge color="red">{summary.invalid} salah</Badge>}
              </div>
              <PreviewTable rows={preview.rows} />
              {ready ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button loading={busy === 'import'} onClick={() => send(false)}>
                    Impor {summary.total} Pengguna
                  </Button>
                  <span className="text-xs text-slate-500">
                    {preview.rows.filter((r) => r.password_generated).length} password akan dibuat
                    otomatis.
                  </span>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  <Alert type="error">
                    Perbaiki {summary.invalid} baris yang salah di Excel, simpan, lalu pilih file
                    lagi. Tidak ada data yang disimpan sampai semua baris benar.
                  </Alert>
                  <Button variant="secondary" onClick={chooseAgain}>
                    Pilih File Lagi
                  </Button>
                </div>
              )}
            </Step>
          )}
        </div>
      )}
    </Modal>
  )
}
