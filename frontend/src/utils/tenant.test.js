import assert from 'node:assert/strict'
import { test } from 'node:test'
import { schoolAddress, tenantFromHost } from './tenant.js'

const BASE = 'sigmateknologi.my.id'

test('subdomain sekolah', () => {
  assert.deepEqual(tenantFromHost('smknj.sigmateknologi.my.id', BASE), {
    mode: 'school',
    code: 'smknj',
  })
  // Huruf besar & titik di akhir nama domain tetap dikenali.
  assert.deepEqual(tenantFromHost('SMP-2.Sigmateknologi.my.id.', BASE), {
    mode: 'school',
    code: 'smp-2',
  })
})

test('alamat Super Admin', () => {
  for (const host of ['admin.sigmateknologi.my.id', 'www.sigmateknologi.my.id', BASE]) {
    assert.deepEqual(tenantFromHost(host, BASE), { mode: 'platform' }, host)
  }
})

test('tanpa domain dasar atau alamat lain = mode lama', () => {
  assert.deepEqual(tenantFromHost('smknj.sigmateknologi.my.id', ''), { mode: 'single' })
  assert.deepEqual(tenantFromHost('192.168.1.10', BASE), { mode: 'single' })
  assert.deepEqual(tenantFromHost('lms.sekolahlain.sch.id', BASE), { mode: 'single' })
  // Mirip tapi bukan subdomain (tanpa titik pemisah).
  assert.deepEqual(tenantFromHost('palsusigmateknologi.my.id', BASE), { mode: 'single' })
  assert.deepEqual(tenantFromHost('a.b.sigmateknologi.my.id', BASE), { mode: 'single' })
})

test('pengembangan di laptop dengan localhost', () => {
  assert.deepEqual(tenantFromHost('smknj.localhost', 'localhost'), {
    mode: 'school',
    code: 'smknj',
  })
  assert.deepEqual(tenantFromHost('localhost', 'localhost'), { mode: 'platform' })
})

test('alamat lengkap sekolah', () => {
  assert.equal(schoolAddress('smknj', BASE), 'https://smknj.sigmateknologi.my.id')
  assert.equal(
    schoolAddress('smknj', 'localhost', { protocol: 'http:', port: '5173' }),
    'http://smknj.localhost:5173',
  )
  assert.equal(schoolAddress('smknj', ''), null)
})
