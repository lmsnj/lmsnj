import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clock,
  countPeriods,
  dayRows,
  daysOf,
  defaultDay,
  loadGap,
  optionsFrom,
  timeRange,
  weekdayOf,
} from './timetable.js'

const slot = (id, day, day_display, starts_at, extra = {}) => ({
  id,
  day,
  day_display,
  starts_at,
  ends_at: '09:00:00',
  kind: 'lesson',
  label: '',
  ...extra,
})
const SLOTS = [
  slot(1, 0, 'Senin', '08:00:00'),
  slot(2, 5, 'Sabtu', '08:00:00'),
  slot(3, 5, 'Sabtu', '07:30:00', { kind: 'activity', label: 'Pembiasaan Karakter Baik' }),
  slot(4, 6, 'Ahad', '08:00:00'),
]
const entry = (time_slot, classroom, classroom_name, subject_code = 'G', teacher = 7) => ({
  time_slot,
  classroom,
  classroom_name,
  subject_code,
  subject_name: subject_code === 'G' ? 'Bahasa Inggris' : 'Matematika',
  teacher,
  teacher_name: teacher === 7 ? 'Bu Siti' : 'Pak Budi',
})

test('nomor hari mengikuti backend (Senin = 0, Ahad = 6)', () => {
  assert.equal(weekdayOf(new Date(2026, 10, 16)), 0) // Senin, 16 November 2026
  assert.equal(weekdayOf(new Date(2026, 10, 14)), 5) // Sabtu
  assert.equal(weekdayOf(new Date(2026, 10, 15)), 6) // Ahad
})

test('hari diurutkan mulai Sabtu dan hanya yang punya jadwal', () => {
  assert.deepEqual(
    daysOf(SLOTS).map((item) => item.label),
    ['Sabtu', 'Ahad', 'Senin'],
  )
  assert.deepEqual(daysOf([]), [])
})

test('hari awal = hari ini jika ada jadwal, selain itu hari pertama', () => {
  const days = daysOf(SLOTS)
  assert.equal(defaultDay(days, new Date(2026, 10, 16)), 0)
  assert.equal(defaultDay(days, new Date(2026, 10, 13)), 5) // Jumat libur -> Sabtu
  assert.equal(defaultDay([], new Date()), null)
})

test('format jam', () => {
  assert.equal(clock('07:30:00'), '07.30')
  assert.equal(timeRange(SLOTS[0]), '08.00 - 09.00')
})

test('baris satu hari urut waktu dan kelas gabungan disatukan', () => {
  const entries = [
    entry(2, 1, 'X-TKJ 2'),
    entry(2, 2, 'X-DPB'),
    entry(2, 3, 'X-RPL', 'H', 8),
    entry(1, 1, 'X-TKJ 2'),
  ]
  const rows = dayRows(SLOTS, entries, 5)
  assert.deepEqual(
    rows.map((row) => row.slot.id),
    [3, 2],
  )
  assert.deepEqual(rows[0].lessons, [])
  assert.equal(rows[1].lessons.length, 2)
  assert.deepEqual(rows[1].lessons[0].classrooms, ['X-TKJ 2', 'X-DPB'])
  assert.equal(rows[1].lessons[1].teacherName, 'Pak Budi')
})

test('jam per minggu menghitung kelas gabungan sekali', () => {
  const entries = [entry(2, 1, 'X-TKJ 2'), entry(2, 2, 'X-DPB'), entry(1, 1, 'X-TKJ 2')]
  assert.equal(countPeriods(entries), 2)
})

test('pilihan dropdown unik dan urut', () => {
  const entries = [entry(2, 2, 'X-TKJ 10'), entry(2, 1, 'X-TKJ 2'), entry(1, 1, 'X-TKJ 2')]
  assert.deepEqual(optionsFrom(entries, 'classroom', 'classroom_name'), [
    { value: '1', label: 'X-TKJ 2' },
    { value: '2', label: 'X-TKJ 10' },
  ])
})

test('selisih jam terjadwal dan JP resmi', () => {
  assert.equal(loadGap({ scheduled_periods: 11, official_hours: 12, unscheduled_hours: 0 }), -1)
  assert.equal(loadGap({ scheduled_periods: 16, official_hours: 28, unscheduled_hours: 12 }), 0)
  assert.equal(loadGap({ scheduled_periods: 4, official_hours: null, unscheduled_hours: 0 }), null)
})
