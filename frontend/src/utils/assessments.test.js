import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatPercent, resultDisplay, studentAssessmentStatus } from './assessments.js'

const result = (status, extra = {}) => ({
  status,
  passing_score: 75,
  final_score: null,
  best_score: null,
  remedial_used: 0,
  remedial_left: 0,
  passed_by_remedial: false,
  ...extra,
})

test('tampilan hasil akhir per status', () => {
  assert.equal(resultDisplay(null), null)
  assert.equal(resultDisplay(result('none')), null)
  assert.equal(resultDisplay(result('pending')).label, 'Menunggu penilaian guru')
  assert.equal(resultDisplay(result('passed')).label, 'Tuntas')
  const byRemedial = resultDisplay(result('passed', { passed_by_remedial: true, best_score: 90 }))
  assert.equal(byRemedial.label, 'Tuntas (remedial)')
  assert.match(byRemedial.message, /dicatat sesuai KKM \(75\)/)
  const remedial = resultDisplay(result('remedial', { remedial_left: 2 }))
  assert.equal(remedial.color, 'amber')
  assert.match(remedial.message, /Sisa kesempatan remedial: 2 kali/)
  assert.match(resultDisplay(result('failed', { remedial_used: 1 })).message, /sudah habis/)
  assert.equal(resultDisplay(result('graded')).label, 'Sudah dinilai')
})

test('status di kartu siswa memakai hasil akhir', () => {
  const base = { is_past_due: false, max_score: 10 }
  assert.equal(studentAssessmentStatus({ ...base, my_attempt: null }).label, 'Belum dikerjakan')
  assert.equal(
    studentAssessmentStatus({ ...base, my_attempt: { status: 'in_progress', number: 2 } }).label,
    'Sedang remedial',
  )
  const remedial = studentAssessmentStatus({
    ...base,
    my_attempt: { status: 'graded', score: 5 },
    my_result: result('remedial', { final_score: 50, remedial_left: 1 }),
  })
  assert.deepEqual(remedial, { label: 'Remedial · 50', color: 'amber' })
  const noKkm = studentAssessmentStatus({
    ...base,
    my_attempt: { status: 'graded', score: 8 },
    my_result: result('graded', { final_score: 80 }),
  })
  assert.equal(noKkm.label, 'Nilai 8/10')
  assert.equal(formatPercent(87.5), '87,5')
})
