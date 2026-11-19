import assert from 'node:assert/strict'
import { test } from 'node:test'
import { light, meter, middleSetting, shutterLabel } from './exposure.js'

const step = {
  apertures: [1.4, 2, 2.8, 4, 5.6, 8, 11],
  shutters: [1 / 1000, 1 / 500, 1 / 250, 1 / 125, 1 / 60],
  isos: [100, 200, 400],
  scene: light({ aperture: 5.6, shutter: 1 / 500, iso: 200 }),
  tolerance: 0.5,
}

test('label shutter & pengaturan tengah', () => {
  assert.equal(shutterLabel(1 / 250), '1/250')
  assert.equal(shutterLabel(1), '1')
  assert.deepEqual(middleSetting(step), { aperture: 4, shutter: 1 / 250, iso: 200 })
})

test('light meter: pas, terang, gelap', () => {
  assert.equal(meter(step, { aperture: 8, shutter: 1 / 250, iso: 200 }).label, 'Pas')
  assert.equal(
    meter(step, { aperture: 5.6, shutter: 1 / 125, iso: 400 }).label,
    'Terlalu terang (+3.0 stop)',
  )
  const dark = meter(step, { aperture: 11, shutter: 1 / 1000, iso: 100 })
  assert.equal(dark.label, 'Terlalu gelap (−3.9 stop)')
  assert.ok(dark.brightness < 0.25)
  assert.equal(meter(step, { aperture: 22, shutter: 1 / 1000, iso: 100 }).brightness, 0.15) // batas bawah
})
