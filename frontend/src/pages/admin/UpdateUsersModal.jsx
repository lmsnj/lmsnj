import { useState } from 'react'
import { usersApi } from '../../api/users'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import FileDownloadButton from '../../components/FileDownloadButton'
import FileInput from '../../components/FileInput'
import Modal from '../../components/Modal'
import SelectField from '../../components/SelectField'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'

const ROLE_OPTIONS = [
  { value: 'student', label: 'Siswa (NIS)' },
  { value: 'teacher', label: 'Guru (NIP & kode guru)' },
]
const FILE_NAMES = { student: 'Perbarui Data Siswa.xlsx', teacher: 'Perbarui Data Guru.xlsx' }

/**
 * Lengkapi NIS / NIP / kode guru akun yang sudah ada: unduh daftar akun -> isi -> Periksa ->
 * Perbarui. Akun dicocokkan lewat username; sel kosong tidak mengubah data lama.
 */
export default function UpdateUsersModal({ onClose, onUpdated }) {
  const [role, setRole] = useState('student')
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  const reset = () => {
    setPreview(null)
    setError('')
  }
  const run = async (dryRun) => {
    setBusy(dryRun ? 'check' : 'save')
    setError('')
    try {
      const data = await usersApi.updateFile(file, role, dryRun)
      if (dryRun) setPreview(data)
      else onUpdated(data.created)
    } catch (err) {
      if (err.response?.data?.rows) setPreview(err.response.data)
      setError(getFieldErrors(err).file ?? getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const changed = preview?.rows.filter((row) => row.changed).length ?? 0
  const ready = preview && preview.summary.invalid === 0 && changed > 0
  return (
    <Modal
      open
      size="lg"
      title="Perbarui Data Pengguna"
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
            <Button loading={busy === 'save'} onClick={() => run(false)}>
              Perbarui {changed} Akun
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Untuk melengkapi NIS siswa atau NIP & kode guru pada akun yang sudah ada. Unduh daftar
          akun, isi kolom yang kosong, lalu unggah. Username jangan diubah; sel yang dikosongkan
          tidak menghapus data lama.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <SelectField
            label="Data yang diperbarui"
            value={role}
            onChange={(event) => {
              setRole(event.target.value)
              reset()
            }}
            options={ROLE_OPTIONS}
          />
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:pb-2.5">
            <input
              type="checkbox"
              checked={onlyMissing}
              onChange={(event) => setOnlyMissing(event.target.checked)}
              className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            Hanya akun yang datanya masih kosong
          </label>
        </div>
        <FileDownloadButton
          fetchBlob={() => usersApi.updateTemplate(role, onlyMissing)}
          filename={FILE_NAMES[role]}
        >
          Unduh Daftar Akun (Excel)
        </FileDownloadButton>
        <FileInput
          label="File Excel yang sudah diisi"
          accept=".xlsx"
          onChange={(chosen) => {
            setFile(chosen)
            reset()
          }}
          hint="Belum ada data yang diubah sampai Anda menekan tombol Perbarui."
        />
        <Alert type="error">{error}</Alert>
        {preview && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge color="gray">{preview.summary.total} baris</Badge>
              <Badge color="green">{changed} akan diubah</Badge>
              {preview.summary.invalid > 0 && (
                <Badge color="red">{preview.summary.invalid} salah</Badge>
              )}
            </div>
            {preview.summary.invalid === 0 && changed === 0 && (
              <Alert type="info">Tidak ada data yang berubah di file ini.</Alert>
            )}
            <div className="max-h-80 overflow-auto rounded-lg ring-1 ring-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Baris</th>
                    <th className="px-3 py-2">Akun</th>
                    <th className="px-3 py-2">Perubahan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((row) => (
                    <tr key={row.row} className={row.errors.length ? 'bg-red-50/60' : ''}>
                      <td className="px-3 py-2 text-slate-500">{row.row}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{row.full_name || '-'}</p>
                        <p className="text-xs text-slate-500">{row.username}</p>
                      </td>
                      <td className="px-3 py-2">
                        {row.errors.length ? (
                          <ul className="list-disc pl-4 text-xs text-red-700">
                            {row.errors.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className={row.changed ? 'text-slate-800' : 'text-slate-400'}>
                            {row.changes}
                          </span>
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
