import { FileSpreadsheet, Save } from 'lucide-react'
import { useState } from 'react'
import { classroomsApi } from '../../api/academics'
import { paymentsApi } from '../../api/payments'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import { StatCard, StatGrid } from '../../components/Dashboard'
import DataTable from '../../components/DataTable'
import EmptyState from '../../components/EmptyState'
import ImportExcelModal from '../../components/ImportExcelModal'
import PageHeader from '../../components/PageHeader'
import SelectField from '../../components/SelectField'
import Spinner from '../../components/Spinner'
import { inputClass } from '../../components/TextField'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'
import { ALL, toOptions } from '../../utils/academic'

const QUARTERS = [0, 1, 2, 3, 4]
const quarterLabel = (n) =>
  n === 0 ? 'Belum ada' : n === 4 ? 'Triwulan 4 (setahun)' : `Triwulan ${n}`

// Tabel satu kelas. Perubahan disimpan sekaligus dengan tombol Simpan.
function ClassPayments({ classroomId, onSaved }) {
  const payments = useFetch(paymentsApi.list, classroomId)
  // Hanya baris yang diubah: { [studentId]: { paid_quarter, note } }.
  const [changes, setChanges] = useState({})
  const rows = (payments.data?.rows ?? []).map((row) => ({ ...row, ...changes[row.student] }))
  const changed = Object.keys(changes).length
  const { submit, submitting, generalError, errors } = useFormSubmit(async () => {
    const records = rows
      .filter((row) => changes[row.student])
      .map((row) => ({ student: row.student, paid_quarter: row.paid_quarter, note: row.note }))
    const result = await paymentsApi.save(payments.data.academic_year, records)
    setChanges({})
    payments.reload()
    onSaved(result.detail)
  })
  const change = (row, field, value) =>
    setChanges({
      ...changes,
      [row.student]: { paid_quarter: row.paid_quarter, note: row.note, [field]: value },
    })

  if (payments.error) return <Alert type="error">{payments.error}</Alert>
  if (!payments.data) {
    return (
      <div className="py-10 text-center text-brand-600">
        <Spinner />
      </div>
    )
  }

  const columns = [
    { header: 'No', className: 'w-12', cell: (row) => rows.indexOf(row) + 1 },
    {
      header: 'Nama',
      cell: (row) => (
        <span className="font-medium whitespace-nowrap text-slate-900">{row.student_name}</span>
      ),
    },
    { header: 'NIS', cell: (row) => row.nis || '-' },
    {
      header: 'Lunas sampai',
      cell: (row) => (
        <select
          aria-label={`Lunas sampai triwulan, ${row.student_name}`}
          value={row.paid_quarter}
          onChange={(event) => change(row, 'paid_quarter', Number(event.target.value))}
          className={`${inputClass} min-w-44 ring-slate-300`}
        >
          {QUARTERS.map((n) => (
            <option key={n} value={n}>
              {quarterLabel(n)}
            </option>
          ))}
        </select>
      ),
    },
    {
      header: 'Keterangan',
      cell: (row) => (
        <input
          aria-label={`Keterangan, ${row.student_name}`}
          value={row.note}
          maxLength={200}
          onChange={(event) => change(row, 'note', event.target.value)}
          className={`${inputClass} min-w-48 ring-slate-300`}
        />
      ),
    },
  ]

  return (
    <>
      <StatGrid>
        <StatCard
          label="Siswa"
          value={rows.length}
          hint={`Tahun ajaran ${payments.data.academic_year}`}
        />
        {[4, 2, 0].map((n) => (
          <StatCard
            key={n}
            label={n === 0 ? 'Belum bayar' : n === 4 ? 'Lunas setahun' : 'Minimal triwulan 2'}
            tone={n === 0 ? 'red' : n === 4 ? 'brand' : 'blue'}
            value={
              rows.filter((r) => (n === 0 ? r.paid_quarter === 0 : r.paid_quarter >= n)).length
            }
          />
        ))}
      </StatGrid>
      <Alert type="error" className="mb-3">
        {generalError || errors.records}
      </Alert>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.student}
        emptyMessage="Belum ada siswa di kelas ini."
      />
      <div className="mt-4 flex items-center justify-end gap-3">
        {changed > 0 && (
          <span className="text-sm text-amber-700">{changed} siswa belum disimpan</span>
        )}
        <Button onClick={submit} loading={submitting} disabled={!changed}>
          <Save className="size-4" aria-hidden="true" /> Simpan
        </Button>
      </div>
    </>
  )
}

// Status pembayaran (khusus admin): sampai triwulan berapa siswa sudah lunas. Dipakai sebagai
// salah satu syarat kartu ujian.
export default function PaymentsPage() {
  const classrooms = useFetch(classroomsApi.list, ALL)
  const [chosen, setChosen] = useState('')
  const [notice, setNotice] = useState('')
  const [importing, setImporting] = useState(false)
  const [version, setVersion] = useState(0)
  const list = classrooms.data?.results ?? []
  const classroomId = chosen || (list[0] ? String(list[0].id) : '')

  return (
    <>
      <PageHeader
        title="Status Pembayaran"
        description="Catat sampai triwulan berapa setiap siswa sudah lunas. Dipakai sebagai syarat kartu ujian."
        actions={
          <Button variant="secondary" onClick={() => setImporting(true)}>
            <FileSpreadsheet className="size-4" aria-hidden="true" /> Impor Excel
          </Button>
        }
      />
      <Alert type="success" className="mb-4">
        {notice}
      </Alert>
      {classrooms.loading && !classrooms.data ? (
        <div className="py-10 text-center text-brand-600">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="Belum ada kelas">Buat kelas di menu Ruang Kelas.</EmptyState>
      ) : (
        <>
          <SelectField
            label="Kelas"
            value={classroomId}
            onChange={(event) => setChosen(event.target.value)}
            options={toOptions(list, (c) => `${c.name} (${c.academic_year})`)}
            className="mb-4 sm:max-w-sm"
          />
          <ClassPayments
            key={`${classroomId}-${version}`}
            classroomId={classroomId}
            onSaved={setNotice}
          />
        </>
      )}
      {importing && (
        <ImportExcelModal
          kind="payments"
          title="Impor Status Pembayaran dari Excel"
          description="Siswa dicocokkan dengan NIS. Tahun ajaran kosong = tahun ajaran terbaru."
          templateName="Template Impor Pembayaran.xlsx"
          columns={[
            { key: 'nis', header: 'NIS' },
            { key: 'full_name', header: 'Nama' },
            { key: 'academic_year', header: 'Tahun Ajaran' },
            { key: 'paid_quarter', header: 'Lunas s.d. Triwulan' },
          ]}
          onClose={() => setImporting(false)}
          onImported={(count) => {
            setImporting(false)
            setNotice(`Status pembayaran ${count} siswa berhasil diimpor.`)
            setVersion((v) => v + 1)
          }}
        />
      )}
    </>
  )
}
