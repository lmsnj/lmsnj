import { Circle, CircleCheck } from 'lucide-react'
import { useState } from 'react'
import { materialsApi } from '../../api/materials'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import DataTable from '../../components/DataTable'
import Modal from '../../components/Modal'
import { inputClass } from '../../components/TextField'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'
import { countChecks } from '../../utils/learningPath'

function rowStatus(row) {
  if (row.completed) return { label: row.unlocked ? 'Dibuka guru' : 'Tercapai', color: 'green' }
  if (row.locked) return { label: 'Terkunci', color: 'gray' }
  if (!row.opened) return { label: 'Belum dibuka', color: 'blue' }
  const { done, total } = countChecks(row.checks)
  return { label: `Belum tercapai (${done}/${total})`, color: 'amber' }
}

// Progres capaian satu materi untuk semua siswa kelasnya. Guru bisa mengesahkan capaian dan
// membuka kunci (menandai tercapai) per siswa; perubahan disimpan sekaligus.
export default function MaterialProgressModal({ material, onClose }) {
  const result = useFetch(materialsApi.progress, material.id)
  // Hanya baris yang diubah: { [studentId]: { field: value } }.
  const [changes, setChanges] = useState({})
  const [notice, setNotice] = useState('')
  const rows = (result.data?.rows ?? []).map((row) => ({ ...row, ...changes[row.student] }))
  const changed = Object.keys(changes).length
  const change = (row, field, value) =>
    setChanges({ ...changes, [row.student]: { ...changes[row.student], [field]: value } })

  const { submit, submitting, generalError, errors } = useFormSubmit(async () => {
    const records = Object.entries(changes).map(([student, fields]) => ({
      student: Number(student),
      ...fields,
    }))
    await materialsApi.saveProgress(material.id, records)
    setChanges({})
    setNotice(`Progres ${records.length} siswa disimpan.`)
    result.reload()
  })

  const columns = [
    {
      header: 'Siswa',
      cell: (row) => <span className="font-medium text-slate-900">{row.student_name}</span>,
    },
    {
      header: 'Syarat',
      cell: (row) => (
        <ul className="min-w-48 space-y-0.5 text-xs">
          {row.checks.map((check) => {
            const Icon = check.done ? CircleCheck : Circle
            return (
              <li key={check.key} className="flex items-center gap-1.5">
                <Icon
                  className={`size-3.5 shrink-0 ${check.done ? 'text-brand-600' : 'text-slate-400'}`}
                  aria-hidden="true"
                />
                <span className={check.done ? 'text-slate-600' : 'text-slate-900'}>
                  {check.label}
                  <span className="sr-only">{check.done ? ' (sudah)' : ' (belum)'}</span>
                </span>
              </li>
            )
          })}
        </ul>
      ),
    },
    {
      header: 'Status',
      cell: (row) => {
        const status = rowStatus(row)
        return <Badge color={status.color}>{status.label}</Badge>
      },
    },
  ]
  if (material.require_teacher_approval) {
    columns.push({
      header: 'Sahkan',
      cell: (row) => (
        <input
          type="checkbox"
          aria-label={`Sahkan capaian ${row.student_name}`}
          checked={row.teacher_approved}
          onChange={(e) => change(row, 'teacher_approved', e.target.checked)}
          className="size-4 rounded text-brand-600"
        />
      ),
    })
  }
  columns.push({
    header: 'Buka kunci',
    cell: (row) => (
      <div className="min-w-44 space-y-1">
        <label className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
          <input
            type="checkbox"
            checked={row.unlocked}
            onChange={(e) => change(row, 'unlocked', e.target.checked)}
            className="size-4 rounded text-brand-600"
          />
          Tandai tercapai
        </label>
        {row.unlocked && (
          <input
            aria-label={`Catatan, ${row.student_name}`}
            value={row.note}
            maxLength={200}
            placeholder="Catatan (mis. siswa pindahan)"
            onChange={(e) => change(row, 'note', e.target.value)}
            className={`${inputClass} ring-slate-300`}
          />
        )}
      </div>
    ),
  })

  return (
    <Modal
      open
      size="lg"
      title={`Progres Capaian: ${material.title}`}
      onClose={onClose}
      footer={
        <>
          {changed > 0 && (
            <span className="mr-auto text-sm text-amber-700">{changed} siswa belum disimpan</span>
          )}
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          <Button onClick={submit} loading={submitting} disabled={!changed}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          &ldquo;Tandai tercapai&rdquo; membuka materi berikutnya untuk siswa itu tanpa menunggu
          syaratnya (mis. siswa pindahan atau sakit lama).
        </p>
        <Alert type="success">{notice}</Alert>
        <Alert type="error">{result.error || generalError || errors.records}</Alert>
        <DataTable
          columns={columns}
          rows={rows}
          loading={result.loading}
          rowKey={(row) => row.student}
          emptyMessage="Belum ada siswa di kelas ini."
        />
      </div>
    </Modal>
  )
}
