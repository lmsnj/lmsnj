import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeBranding, pickSchool } from './schools.js'

const schools = [
  { id: 1, name: 'MI Nurul Jadid', is_active: true },
  { id: 2, name: 'SMKS Nurul Jadid', is_active: true },
  { id: 3, name: 'Sekolah Lama', is_active: false },
]

test('memilih sekolah tersimpan jika masih boleh dibuka', () => {
  assert.equal(pickSchool(schools, '2').id, 2)
  assert.equal(pickSchool(schools, 2).id, 2)
})

test('kembali ke sekolah pertama jika tersimpan tidak valid atau nonaktif', () => {
  assert.equal(pickSchool(schools, '99').id, 1)
  assert.equal(pickSchool(schools, '3').id, 1)
  assert.equal(pickSchool(schools, null).id, 1)
  assert.equal(pickSchool([], '1'), null)
})

test('identitas sekolah menimpa identitas yayasan', () => {
  const app = { school_name: 'Yayasan', slogan: 'A', app_name: 'LMS', logo_url: '/logo-yayasan' }
  assert.deepEqual(mergeBranding(app, null), app)
  const smk = { name: 'SMK', slogan: 'B', logo_url: null }
  assert.deepEqual(mergeBranding(app, smk), {
    school_name: 'SMK',
    slogan: 'B',
    app_name: 'LMS',
    logo_url: '/logo-yayasan',
  })
  assert.equal(mergeBranding(app, { ...smk, logo_url: '/logo-smk' }).logo_url, '/logo-smk')
})
