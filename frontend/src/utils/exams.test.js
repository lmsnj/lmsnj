import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  countEligibility,
  eligibilityStatus,
  eventToForm,
  formatCheckValue,
  formatDateRange,
  formToPayload,
  gradesLabel,
  paginate,
  requirementSummary,
} from './exams.js'

test('form acara: kosong = null, angka dikirim sebagai angka', () => {
  const form = eventToForm(null, '2026/2027')
  assert.equal(form.academic_year, '2026/2027')
  assert.equal(form.min_attendance, '')
  assert.equal(form.count_excused, true)

  const payload = formToPayload({
    ...form,
    name: 'PAS',
    exam_start: '2026-12-01',
    min_attendance: '75',
  })
  assert.equal(payload.min_attendance, 75)
  assert.equal(payload.min_task_rate, null)
  assert.equal(payload.exam_end, null)
  assert.equal(payload.exam_start, '2026-12-01')

  const edit = eventToForm({ name: 'PTS', min_paid_quarter: 0, grades: ['X'] })
  assert.equal(edit.min_paid_quarter, '0')
  assert.equal(formToPayload(edit).min_paid_quarter, 0)
})

test('ringkasan syarat dan tingkat', () => {
  const event = {
    min_attendance: 80,
    count_excused: false,
    min_task_rate: null,
    min_average: 70,
    min_paid_quarter: 2,
    require_homeroom_check: true,
  }
  assert.deepEqual(requirementSummary(event), [
    'Kehadiran minimal 80%',
    'Rata-rata nilai minimal 70',
    'Pembayaran lunas sampai triwulan 2',
    'Persetujuan wali kelas',
  ])
  assert.equal(gradesLabel([]), 'Semua tingkat')
  assert.equal(gradesLabel(['X', 'XI']), 'Kelas X, XI')
})

test('format nilai syarat', () => {
  assert.equal(formatCheckValue({ key: 'attendance', value: 87.5 }), '87,5%')
  assert.equal(formatCheckValue({ key: 'task_rate', value: null }), 'Belum ada data')
  assert.equal(formatCheckValue({ key: 'average', value: 76.25 }), '76,25')
  assert.equal(formatCheckValue({ key: 'paid_quarter', value: 0 }), 'Belum bayar')
  assert.equal(formatCheckValue({ key: 'paid_quarter', value: 3 }), 'Triwulan 3')
  assert.equal(formatCheckValue({ key: 'homeroom', value: false }), 'Belum')
})

test('status & hitungan kelayakan', () => {
  const rows = [
    { requirements_met: true, eligible: true },
    { requirements_met: false, eligible: true },
    { requirements_met: false, eligible: false },
  ]
  assert.deepEqual(
    rows.map((r) => eligibilityStatus(r).label),
    ['Memenuhi syarat', 'Dikecualikan', 'Belum memenuhi'],
  )
  assert.deepEqual(countEligibility(rows), { total: 3, met: 1, exempted: 1, notEligible: 1 })
})

test('tanggal & halaman cetak', () => {
  assert.equal(formatDateRange('2026-12-01'), '1 Desember 2026')
  assert.equal(formatDateRange('2026-12-01', '2026-12-07'), '1 Desember 2026 – 7 Desember 2026')
  assert.equal(formatDateRange(null), '-')
  assert.deepEqual(paginate([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(paginate([]), [])
})
