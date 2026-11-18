import assert from 'node:assert/strict'
import { test } from 'node:test'
import { teamLabel, teamPartners, teamTeachers, uniqueClassSubjects } from './teams.js'

const siti = {
  id: 1,
  classroom: 10,
  subject: 5,
  teacher_name: 'Siti',
  team_teachers: ['Siti', 'Ahmad'],
}
const ahmad = {
  id: 2,
  classroom: 10,
  subject: 5,
  teacher_name: 'Ahmad',
  team_teachers: ['Siti', 'Ahmad'],
}
const bindo = { id: 3, classroom: 10, subject: 6, teacher_name: 'Rudi', team_teachers: ['Rudi'] }

test('satu kartu per kelas-mapel', () => {
  assert.deepEqual(uniqueClassSubjects([siti, bindo, ahmad]), [siti, bindo])
  assert.deepEqual(uniqueClassSubjects(), [])
})

test('nama guru tim', () => {
  assert.deepEqual(teamTeachers(siti), ['Siti', 'Ahmad'])
  // Data lama tanpa team_teachers tetap menampilkan guru pengampunya.
  assert.deepEqual(teamTeachers({ teacher_name: 'Budi' }), ['Budi'])
  assert.equal(teamLabel(siti), 'Siti dan Ahmad')
  assert.equal(teamLabel(bindo), 'Rudi')
  assert.equal(teamLabel({ team_teachers: ['A', 'B', 'C'] }), 'A, B, dan C')
  assert.deepEqual(teamPartners(ahmad), ['Siti'])
  assert.deepEqual(teamPartners(bindo), [])
})
