import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clock,
  countPeriods,
  dayRows,
  daysOf,
  defaultDay,
  importSummary,
  isoDate,
  loadGap,
  optionsFrom,
  periodLabel,
  timeRange,
  todayLessons,
  weekAhead,
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

// Senin 16 November 2026 (hari 0).
const MONDAY = (hour, minute = 0) => new Date(2026, 10, 16, hour, minute)
const lessonSlot = (id, period, starts_at, ends_at, extra = {}) => ({
  id,
  day: 0,
  day_display: 'Senin',
  period,
  starts_at,
  ends_at,
  kind: 'lesson',
  label: '',
  ...extra,
})
const TODAY_SLOTS = [
  lessonSlot(10, 1, '07:00:00', '07:45:00'),
  lessonSlot(11, 2, '07:45:00', '08:30:00'),
  lessonSlot(12, null, '08:30:00', '08:45:00', { kind: 'activity', label: 'Istirahat' }),
  lessonSlot(13, 3, '08:45:00', '09:30:00'),
  lessonSlot(14, 4, '09:30:00', '10:15:00'),
  lessonSlot(15, 5, '10:15:00', '11:00:00'),
  lessonSlot(16, 6, '11:00:00', '11:45:00'),
  { ...lessonSlot(17, 1, '07:00:00', '07:45:00'), day: 1, day_display: 'Selasa' },
]
const TODAY_ENTRIES = [
  { ...entry(10, 1, 'X RPL 1', 'M'), teaching_assignment: 5 },
  { ...entry(11, 1, 'X RPL 1', 'M'), teaching_assignment: 5 },
  // Setelah istirahat pelajaran yang sama tetap blok baru.
  { ...entry(13, 1, 'X RPL 1', 'M'), teaching_assignment: 5 },
  { ...entry(14, 1, 'X RPL 1'), teaching_assignment: 6 },
  // Jam 5 kosong memutus blok.
  { ...entry(16, 1, 'X RPL 1'), teaching_assignment: 6 },
  { ...entry(17, 1, 'X RPL 1'), teaching_assignment: 6 },
]

test('todayLessons menggabung jam berurutan dan tidak melewati istirahat atau jam kosong', () => {
  const blocks = todayLessons(TODAY_SLOTS, TODAY_ENTRIES, MONDAY(6))
  assert.deepEqual(
    blocks.map((block) => [
      block.periods,
      block.startsAt,
      block.endsAt,
      block.lessons[0].subjectCode,
    ]),
    [
      [[1, 2], '07:00:00', '08:30:00', 'M'],
      [[3], '08:45:00', '09:30:00', 'M'],
      [[4], '09:30:00', '10:15:00', 'G'],
      [[6], '11:00:00', '11:45:00', 'G'],
    ],
  )
  assert.deepEqual(blocks[0].lessons[0].assignments, [5])
})

test('todayLessons menandai pelajaran yang sudah lewat, sedang, dan akan datang', () => {
  const status = (date) => todayLessons(TODAY_SLOTS, TODAY_ENTRIES, date).map((b) => b.status)
  assert.deepEqual(status(MONDAY(6)), ['upcoming', 'upcoming', 'upcoming', 'upcoming'])
  assert.deepEqual(status(MONDAY(8)), ['now', 'upcoming', 'upcoming', 'upcoming'])
  assert.deepEqual(status(MONDAY(8, 30)), ['done', 'upcoming', 'upcoming', 'upcoming'])
  assert.deepEqual(status(MONDAY(12)), ['done', 'done', 'done', 'done'])
})

test('todayLessons kosong pada hari tanpa jadwal (Jumat libur)', () => {
  assert.deepEqual(todayLessons(TODAY_SLOTS, TODAY_ENTRIES, new Date(2026, 10, 20, 8)), [])
})

test('periodLabel', () => {
  assert.equal(periodLabel([]), '')
  assert.equal(periodLabel([3]), 'Jam 3')
  assert.equal(periodLabel([1, 2, 3]), 'Jam 1-3')
})

test('isoDate memakai tanggal lokal dan weekAhead = tujuh hari', () => {
  assert.equal(isoDate(new Date(2026, 0, 5, 23, 30)), '2026-01-05')
  assert.deepEqual(weekAhead(new Date(2026, 11, 29, 8)), {
    date_from: '2026-12-29',
    date_to: '2027-01-04',
  })
})

test('importSummary', () => {
  const lines = importSummary({
    subjects: { created: ['MTK'], matched: [], existing: 2 },
    classrooms: { created: [], matched: ['X-RPL -> X RPL 1'], existing: 3 },
    teachers: { created: [{}, {}], linked: [], existing: 0 },
    assignments: { created: 4, existing: 1, hours_set: 0 },
    timetable: { code: 'JDW-1', created: true, slots: 10, entries: 20, active: true },
  })
  assert.deepEqual(
    lines.map((line) => line.value),
    [
      '1 baru, 2 sudah ada',
      '0 baru, 3 sudah ada, 1 dicocokkan',
      '2 akun baru, 0 sudah ada',
      '4 baru, 1 sudah ada',
      'versi baru · 10 slot waktu, 20 jam pelajaran · jadi jadwal aktif',
    ],
  )
})
