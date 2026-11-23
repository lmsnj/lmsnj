import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  countSubjectsByCategory,
  filterNavByFeatures,
  filterSubjectRows,
  moveId,
  formatHistoryValue,
  formatSettingValue,
  sameValue,
  sourceLabel,
  totalWeight,
} from './settings.js'

test('teks ringkas nilai pengaturan per jenis isian', () => {
  assert.equal(formatSettingValue({ kind: 'int', unit: 'menit' }, 5), '5 menit')
  assert.equal(formatSettingValue({ kind: 'int' }, 75), '75')
  assert.equal(formatSettingValue({ kind: 'bool' }, false), 'Tidak')
  const choice = { kind: 'choice', options: [{ value: 'A5', label: 'Kertas A5' }] }
  assert.equal(formatSettingValue(choice, 'A5'), 'Kertas A5')
  assert.equal(formatSettingValue(choice, 'B4'), 'B4')
  const multi = {
    kind: 'multi',
    options: [
      { value: 'a', label: 'Satu' },
      { value: 'b', label: 'Dua' },
    ],
  }
  assert.equal(formatSettingValue(multi, ['a', 'b']), 'Satu, Dua')
  assert.equal(
    formatSettingValue({ kind: 'bands' }, [
      { label: 'A', min: 90 },
      { label: 'B', min: 0 },
    ]),
    'A ≥ 90, B ≥ 0',
  )
  assert.equal(
    formatSettingValue({ kind: 'weights' }, [{ label: 'Tugas', weight: 100 }]),
    'Tugas 100%',
  )
  const fields = {
    kind: 'fields',
    fields: [
      { name: 'max_px', label: 'Sisi', unit: 'px' },
      { name: 'quality', label: 'Kualitas', unit: '%' },
    ],
  }
  assert.equal(
    formatSettingValue(fields, { max_px: 1600, quality: 70 }),
    'Sisi 1600 px, Kualitas 70 %',
  )
  assert.equal(formatSettingValue({ kind: 'int' }, null), '-')
})

test('asal nilai yang berlaku', () => {
  assert.equal(sourceLabel('default', 'school'), 'Bawaan sistem')
  assert.equal(sourceLabel('school', 'school'), 'Diubah di sini')
  assert.equal(sourceLabel('school', 'subject'), 'Pengaturan sekolah')
})

test('perbandingan nilai dan jumlah bobot', () => {
  assert.ok(sameValue([{ label: 'A', min: 1 }], [{ label: 'A', min: 1 }]))
  assert.ok(!sameValue(75, 70))
  assert.equal(totalWeight([{ weight: 30 }, { weight: '20' }, { weight: '' }]), 50)
  assert.equal(totalWeight(null), 0)
})

test('menu fitur yang mati tidak tampil', () => {
  const nav = {
    main: [{ label: 'Beranda' }, { label: 'Kuis QR', feature: 'kuis_qr' }],
    more: [{ label: 'Presentasi', feature: 'presentasi' }, { label: 'Profil' }],
  }
  const off = filterNavByFeatures(nav, { kuis_qr: false })
  assert.deepEqual(
    off.main.map((item) => item.label),
    ['Beranda'],
  )
  assert.deepEqual(
    off.more.map((item) => item.label),
    ['Profil'],
  )
  const on = filterNavByFeatures(nav, { kuis_qr: true, presentasi: true })
  assert.equal(on.main.length, 2)
  assert.equal(on.more.length, 2)
  // Belum dimuat = fitur dianggap mati.
  assert.equal(filterNavByFeatures(nav, null).main.length, 1)
})

test('teks nilai di riwayat', () => {
  assert.equal(formatHistoryValue(null), 'Bawaan')
  assert.equal(formatHistoryValue(true), 'Ya')
  assert.equal(formatHistoryValue(75), '75')
  assert.equal(formatHistoryValue(['a', 'b']), 'a, b')
  assert.equal(formatHistoryValue([{ label: 'A', min: 90 }]), 'A ≥ 90')
  assert.equal(formatHistoryValue([{ label: 'Tugas', weight: 30 }]), 'Tugas 30%')
  assert.equal(formatHistoryValue({ max_px: 1600, quality: 70 }), 'max_px: 1600, quality: 70')
})

test('penyaring mapel per kategori', () => {
  const rows = [
    { subject: 1, name: 'Matematika', code: 'MTK', category: 1 },
    { subject: 2, name: 'Pemrograman Dasar', code: 'PD', category: 2 },
    { subject: 3, name: 'Bahasa Arab', code: 'BAR', category: null },
  ]
  assert.equal(filterSubjectRows(rows).length, 3)
  assert.deepEqual(
    filterSubjectRows(rows, { category: 'none' }).map((r) => r.subject),
    [3],
  )
  assert.deepEqual(
    filterSubjectRows(rows, { category: '2' }).map((r) => r.subject),
    [2],
  )
  assert.deepEqual(
    filterSubjectRows(rows, { search: 'mtk' }).map((r) => r.subject),
    [1],
  )
  assert.deepEqual(countSubjectsByCategory(rows), { none: 1, 1: 1, 2: 1 })
  assert.equal(
    formatSettingValue({ kind: 'mode', options: [{ value: 'lab', label: 'Lab' }] }, 'lab'),
    'Lab',
  )
})

test('pindah urutan', () => {
  assert.deepEqual(moveId([1, 2, 3], 3, -1), [1, 3, 2])
  assert.deepEqual(moveId([1, 2, 3], 1, -1), [1, 2, 3])
  assert.deepEqual(moveId([1, 2, 3], 3, 1), [1, 2, 3])
})
