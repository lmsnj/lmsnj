import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loginAddress, shareText, whatsappUrl } from './accountCards.js'

const account = {
  full_name: 'Budi Santoso',
  username: 'budi',
  classroom: 'X RPL 1',
  password: 'awan1234',
}

test('alamat login: subdomain sekolah atau alamat aplikasi', () => {
  const server = { protocol: 'https:', port: '', origin: 'https://admin.sigmateknologi.my.id' }
  assert.equal(loginAddress('smknj', 'sigmateknologi.my.id', server), 'smknj.sigmateknologi.my.id')
  const laptop = { protocol: 'http:', port: '5173', origin: 'http://localhost:5173' }
  assert.equal(loginAddress('smknj', 'localhost', laptop), 'smknj.localhost:5173')
  // Tanpa domain dasar (satu alamat untuk semua sekolah).
  assert.equal(loginAddress('smknj', '', laptop), 'localhost:5173')
})

test('teks pesan dengan password baru', () => {
  const text = shareText({
    schoolName: 'SMKS Nurul Jadid',
    address: 'smknj.sigmateknologi.my.id',
    account,
  })
  assert.match(text, /^\*Akun LMS SMKS Nurul Jadid\*/)
  assert.match(text, /Kelas: X RPL 1/)
  assert.match(text, /Username: budi/)
  assert.match(text, /Password: awan1234/)
  assert.match(text, /Segera ganti password/)
})

test('teks pesan tanpa password dan tanpa kelas (guru)', () => {
  const text = shareText({
    schoolName: 'SMKS Nurul Jadid',
    address: 'smknj.sigmateknologi.my.id',
    account: { full_name: 'Bu Siti', username: 'bu.siti', classroom: null, password: null },
  })
  assert.doesNotMatch(text, /Kelas:/)
  assert.match(text, /Password: \(password yang sudah Anda miliki\)/)
  assert.doesNotMatch(text, /Segera ganti password/)
})

test('tautan WhatsApp', () => {
  assert.equal(whatsappUrl('Halo & salam'), 'https://wa.me/?text=Halo%20%26%20salam')
  assert.equal(whatsappUrl('a', '0812-3456-789'), 'https://wa.me/628123456789?text=a')
  assert.equal(whatsappUrl('a', '+62 812 3456'), 'https://wa.me/628123456?text=a')
})
