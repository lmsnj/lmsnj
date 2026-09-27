import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countBy, filterMaterials, subjectIconKey } from './materialFilters.js'

const materials = [
  { id: 1, teaching_assignment: 5, material_type: 'pdf', title: 'Modul Dasar HTML', description: '', subject_name: 'Pemrograman Web' },
  { id: 2, teaching_assignment: 5, material_type: 'video', title: 'Video Struktur', description: 'Tag HTML', subject_name: 'Pemrograman Web' },
  { id: 3, teaching_assignment: 7, material_type: 'link', title: 'KBBI Daring', description: '', subject_name: 'Bahasa Indonesia' },
] // prettier-ignore

test('saring berdasarkan mapel, tipe, dan kata kunci (tanpa beda huruf besar)', () => {
  const ids = (filters) => filterMaterials(materials, filters).map((m) => m.id)
  assert.deepEqual(ids({}), [1, 2, 3])
  assert.deepEqual(ids({ assignment: '5' }), [1, 2])
  assert.deepEqual(ids({ type: 'link' }), [3])
  assert.deepEqual(ids({ search: 'html' }), [1, 2]) // judul atau deskripsi
  assert.deepEqual(ids({ search: 'bahasa  daring' }), [3]) // semua kata harus ada
  assert.deepEqual(ids({ search: 'html', type: 'video', assignment: 5 }), [2])
  assert.deepEqual(filterMaterials(null, {}), [])
})

test('hitung materi per tipe dan per mapel', () => {
  assert.deepEqual(countBy(materials, 'material_type'), { pdf: 1, video: 1, link: 1 })
  assert.deepEqual(countBy(materials, 'teaching_assignment'), { 5: 2, 7: 1 })
})

test('ikon mapel ditebak dari nama', () => {
  assert.equal(subjectIconKey('Matematika'), 'math')
  assert.equal(subjectIconKey('Bahasa Inggris'), 'english')
  assert.equal(subjectIconKey('Bahasa Indonesia'), 'language')
  assert.equal(subjectIconKey('Bahasa Arab'), 'arabic')
  assert.equal(subjectIconKey('Pemrograman Berorientasi Objek'), 'code')
  assert.equal(subjectIconKey('Basis Data'), 'database')
  assert.equal(subjectIconKey('Jaringan Komputer'), 'network')
  assert.equal(subjectIconKey('Biologi'), 'biology')
  assert.equal(subjectIconKey('Mapel Baru'), 'default')
})
