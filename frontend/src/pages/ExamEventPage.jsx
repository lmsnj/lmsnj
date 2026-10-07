import { CircleCheck, CircleX, KeyRound, Printer, Save } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { examsApi } from '../api/exams'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import Button from '../components/Button'
import ClassHero from '../components/ClassHero'
import { StatCard, StatGrid } from '../components/Dashboard'
import DataTable from '../components/DataTable'
import EmptyState from '../components/EmptyState'
import SelectField from '../components/SelectField'
import Spinner from '../components/Spinner'
import { inputClass } from '../components/TextField'
import useAuth from '../hooks/useAuth'
import useFetch from '../hooks/useFetch'
import useFormSubmit from '../hooks/useFormSubmit'
import { toOptions } from '../utils/academic'
import { isAdminRole } from '../utils/constants'
import { getErrorMessage } from '../utils/errors'
import {
  countEligibility,
  eligibilityStatus,
  formatCheckValue,
  formatDateRange,
  gradesLabel,
  requirementSummary,
} from '../utils/exams'

const LoadingBlock = () => (
  <div className="py-10 text-center text-brand-600">
    <Spinner />
  </div>
)

// Nilai satu syarat: ikon centang/silang + angka, merah jika belum memenuhi.
function CheckCell({ check }) {
  const Icon = check.passed ? CircleCheck : CircleX
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap ${
        check.passed ? 'text-brand-700' : 'font-semibold text-red-600'
      }`}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {formatCheckValue(check)}
      <span className="sr-only">{check.passed ? '(memenuhi)' : '(belum memenuhi)'}</span>
    </span>
  )
}

// Tabel kelayakan satu kelas. Perubahan (centang wali, pengecualian, ruang) disimpan sekaligus.
function ClassEligibility({ event, classroomId, isAdmin, onSaved }) {
  const params = { id: event.id, classroom: classroomId }
  const result = useFetch(examsApi.eligibility, params)
  // Hanya baris yang diubah: { [studentId]: { field: value } }.
  const [changes, setChanges] = useState({})
  const rows = (result.data?.rows ?? []).map((row) => ({ ...row, ...changes[row.student] }))
  const changed = Object.keys(changes).length

  const { submit, submitting, generalError, errors } = useFormSubmit(async () => {
    const records = Object.entries(changes).map(([student, fields]) => ({
      student: Number(student),
      ...fields,
    }))
    await examsApi.saveEligibility(event.id, classroomId, records)
    setChanges({})
    result.reload()
    onSaved(`Perubahan ${records.length} siswa disimpan.`)
  })
  const change = (row, field, value) =>
    setChanges({ ...changes, [row.student]: { ...changes[row.student], [field]: value } })
  const [resetting, setResetting] = useState(null)
  const resetToken = async (row) => {
    const question = `Buat token baru untuk ${row.student_name}? Kartu lama tidak berlaku lagi dan harus dicetak ulang.`
    if (!window.confirm(question)) return
    setResetting(row.student)
    try {
      const res = await examsApi.resetToken(event.id, classroomId, row.student)
      onSaved(res.detail)
      result.reload()
    } catch (err) {
      window.alert(getErrorMessage(err))
    } finally {
      setResetting(null)
    }
  }

  if (result.error) return <Alert type="error">{result.error}</Alert>
  if (!result.data) return <LoadingBlock />

  const counts = countEligibility(result.data.rows)
  // Kolom syarat diambil dari baris pertama (semua siswa punya syarat yang sama).
  const checkColumns = (result.data.rows[0]?.checks ?? []).filter((c) => c.key !== 'homeroom')
  const columns = [
    { header: 'No', className: 'w-12', cell: (row) => rows.indexOf(row) + 1 },
    {
      header: 'Siswa',
      cell: (row) => (
        <div className="min-w-40">
          <p className="font-medium text-slate-900">{row.student_name}</p>
          <p className="text-xs text-slate-500">
            NIS {row.nis || '-'} • No. {row.exam_number}
          </p>
        </div>
      ),
    },
    ...checkColumns.map((column) => ({
      header: `${column.label} ≥ ${column.minimum}`,
      cell: (row) => <CheckCell check={row.checks.find((c) => c.key === column.key)} />,
    })),
  ]
  if (event.require_homeroom_check) {
    columns.push({
      header: 'Persetujuan wali',
      cell: (row) => (
        <label className="inline-flex items-center gap-2 whitespace-nowrap">
          <input
            type="checkbox"
            checked={row.homeroom_checked}
            onChange={(e) => change(row, 'homeroom_checked', e.target.checked)}
            className="size-4 rounded text-brand-600"
          />
          {row.homeroom_checked ? 'Disetujui' : 'Belum'}
        </label>
      ),
    })
  }
  if (isAdmin) {
    columns.push(
      {
        header: 'Pengecualian',
        cell: (row) => (
          <div className="min-w-52 space-y-1.5">
            <label className="inline-flex items-center gap-2 whitespace-nowrap">
              <input
                type="checkbox"
                checked={row.exempted}
                onChange={(e) => change(row, 'exempted', e.target.checked)}
                className="size-4 rounded text-brand-600"
              />
              Boleh ikut ujian
            </label>
            {row.exempted && (
              <input
                aria-label={`Alasan pengecualian, ${row.student_name}`}
                value={row.exemption_reason}
                maxLength={200}
                placeholder="Alasan (wajib)"
                onChange={(e) => change(row, 'exemption_reason', e.target.value)}
                className={`${inputClass} ring-slate-300`}
              />
            )}
          </div>
        ),
      },
      {
        header: 'Ruang',
        cell: (row) => (
          <input
            aria-label={`Ruang ujian, ${row.student_name}`}
            value={row.room}
            maxLength={50}
            placeholder="-"
            onChange={(e) => change(row, 'room', e.target.value)}
            className={`${inputClass} w-24 ring-slate-300`}
          />
        ),
      },
    )
  } else if (rows.some((row) => row.exempted)) {
    columns.push({
      header: 'Pengecualian',
      cell: (row) => (row.exempted ? row.exemption_reason : '-'),
    })
  }
  columns.push({
    header: 'Token kartu',
    cell: (row) =>
      row.token ? (
        <div className="flex items-center gap-1 whitespace-nowrap">
          <span className="font-mono font-semibold tracking-widest text-slate-900">
            {row.token}
          </span>
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              loading={resetting === row.student}
              onClick={() => resetToken(row)}
              title="Buat token baru (kartu hilang)"
            >
              <KeyRound className="size-4" aria-hidden="true" />
              <span className="sr-only">Ganti token {row.student_name}</span>
            </Button>
          )}
        </div>
      ) : (
        <span className="text-xs text-slate-400">Dibuat saat kartu dicetak</span>
      ),
  })
  columns.push({
    header: 'Status',
    cell: (row) => {
      const status = eligibilityStatus(row)
      return <Badge color={status.color}>{status.label}</Badge>
    },
  })

  return (
    <>
      <StatGrid>
        <StatCard label="Siswa" value={counts.total} hint={result.data.classroom_name} />
        <StatCard label="Memenuhi syarat" tone="brand" value={counts.met} />
        <StatCard label="Dikecualikan" tone="blue" value={counts.exempted} />
        <StatCard label="Belum memenuhi" tone="red" value={counts.notEligible} />
      </StatGrid>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Kartu dicetak untuk {counts.met + counts.exempted} siswa yang memenuhi syarat atau
          dikecualikan.
        </p>
        <Link
          to={`/cetak/kartu-ujian/${event.id}?kelas=${classroomId}`}
          className={`inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 ${
            changed ? 'pointer-events-none opacity-60' : ''
          }`}
          aria-disabled={changed > 0}
        >
          <Printer className="size-4" aria-hidden="true" /> Cetak Kartu
        </Link>
      </div>
      <Alert type="error" className="mb-3">
        {generalError || errors.records}
      </Alert>
      <DataTable
        columns={columns}
        rows={rows}
        loading={result.loading}
        rowKey={(row) => row.student}
        emptyMessage="Belum ada siswa di kelas ini."
      />
      {(isAdmin || event.require_homeroom_check) && (
        <div className="mt-4 flex items-center justify-end gap-3">
          {changed > 0 && (
            <span className="text-sm text-amber-700">
              {changed} siswa belum disimpan (simpan dulu sebelum mencetak)
            </span>
          )}
          <Button onClick={submit} loading={submitting} disabled={!changed}>
            <Save className="size-4" aria-hidden="true" /> Simpan
          </Button>
        </div>
      )}
    </>
  )
}

// Detail acara ujian: syarat, pilihan kelas, tabel kelayakan, dan tombol cetak kartu.
export default function ExamEventPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const isAdmin = isAdminRole(user.role)
  const base = isAdmin ? '/admin/ujian' : '/guru/ujian'
  const event = useFetch(examsApi.get, id)
  const classrooms = useFetch(examsApi.classrooms, id)
  const [chosen, setChosen] = useState('')
  const [notice, setNotice] = useState('')
  const list = classrooms.data ?? []
  const classroomId = chosen || (list[0] ? String(list[0].id) : '')

  if (event.error) return <Alert type="error">{event.error}</Alert>
  if (!event.data) return <LoadingBlock />

  const requirements = requirementSummary(event.data)
  return (
    <>
      <ClassHero
        back={{ to: base, label: isAdmin ? 'Ujian & Kartu Ujian' : 'Kartu Ujian Kelas Wali' }}
        title={event.data.name}
        info={[
          formatDateRange(event.data.exam_start, event.data.exam_end),
          `Tahun ajaran ${event.data.academic_year}`,
          gradesLabel(event.data.grades),
        ]}
      />
      <section className="mb-6 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-sm font-semibold text-slate-900">Syarat kartu ujian</h2>
        {requirements.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {requirements.map((item) => (
              <li key={item}>
                <Badge color="green">{item}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-slate-500">Tanpa syarat: semua siswa mendapat kartu.</p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Data yang belum ada (presensi belum diisi, belum ada tugas atau nilai) dianggap memenuhi.
          {isAdmin && ' Pengecualian hanya dapat diberikan admin, dengan alasan.'}
        </p>
      </section>

      <Alert type="success" className="mb-4">
        {notice}
      </Alert>
      <Alert type="error" className="mb-4">
        {classrooms.error}
      </Alert>
      {classrooms.loading && !classrooms.data ? (
        <LoadingBlock />
      ) : list.length === 0 ? (
        <EmptyState title={isAdmin ? 'Tidak ada kelas yang ikut' : 'Kelas wali Anda tidak ikut'}>
          {isAdmin
            ? `Belum ada kelas di tahun ajaran ${event.data.academic_year} untuk tingkat ini.`
            : 'Acara ini tidak mencakup kelas yang Anda walikan.'}
        </EmptyState>
      ) : (
        <>
          {list.length > 1 && (
            <SelectField
              label="Kelas"
              value={classroomId}
              onChange={(e) => {
                setChosen(e.target.value)
                setNotice('')
              }}
              options={toOptions(list, (c) => `${c.name} (${c.student_count} siswa)`)}
              className="mb-4 sm:max-w-sm"
            />
          )}
          <ClassEligibility
            key={classroomId}
            event={event.data}
            classroomId={classroomId}
            isAdmin={isAdmin}
            onSaved={setNotice}
          />
        </>
      )}
    </>
  )
}
