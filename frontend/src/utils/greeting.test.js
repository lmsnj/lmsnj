import assert from 'node:assert/strict'
import { test } from 'node:test'
import { firstName, longDate, timeGreeting } from './greeting.js'

const at = (hour) => new Date(2026, 8, 28, hour, 30)

test('sapaan sesuai jam', () => {
  assert.equal(timeGreeting(at(6)), 'Selamat pagi')
  assert.equal(timeGreeting(at(12)), 'Selamat siang')
  assert.equal(timeGreeting(at(16)), 'Selamat sore')
  assert.equal(timeGreeting(at(20)), 'Selamat malam')
  assert.equal(timeGreeting(at(2)), 'Selamat malam')
})

test('tanggal lengkap berbahasa Indonesia dan nama depan', () => {
  assert.equal(longDate(new Date(2026, 8, 28)), 'Senin, 28 September 2026')
  assert.equal(firstName('  Muhammad Rizki '), 'Muhammad')
  assert.equal(firstName(''), '')
})
