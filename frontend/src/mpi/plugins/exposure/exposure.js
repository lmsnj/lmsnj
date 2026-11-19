/**
 * Fungsi murni simulator exposure (pasangan backend `plugins/exposure.py`). Diuji di exposure.test.js.
 * Terang = log2(shutter × ISO / f²) dalam satuan stop; selisih dengan `scene` = terang/gelap foto.
 */

// Pilihan bawaan (sama dengan backend APERTURES, SHUTTERS, ISOS).
export const APERTURES = [1.4, 1.8, 2, 2.8, 4, 5.6, 8, 11, 16, 22]
export const SHUTTERS = [1 / 4000, 1 / 2000, 1 / 1000, 1 / 500, 1 / 250, 1 / 125, 1 / 60, 1 / 30, 1 / 15, 1 / 8, 1 / 4, 1 / 2, 1] // prettier-ignore
export const ISOS = [100, 200, 400, 800, 1600, 3200, 6400]

export function shutterLabel(seconds) {
  return seconds < 1 ? `1/${Math.round(1 / seconds)}` : `${seconds}`
}

export function light({ aperture, shutter, iso }) {
  return Math.log2((shutter * iso) / (aperture * aperture))
}

/** Pengaturan awal: pilihan tengah setiap daftar. */
export function middleSetting(step) {
  const mid = (list) => list[Math.floor(list.length / 2)]
  return { aperture: mid(step.apertures), shutter: mid(step.shutters), iso: mid(step.isos) }
}

/** -> { difference, brightness (filter CSS), label } untuk light meter & pratinjau foto. */
export function meter(step, setting) {
  const difference = light(setting) - step.scene
  const brightness = Math.min(3, Math.max(0.15, 2 ** (difference * 0.6)))
  const amount = Math.abs(difference).toFixed(1)
  let label = 'Pas'
  if (difference > step.tolerance) label = `Terlalu terang (+${amount} stop)`
  else if (difference < -step.tolerance) label = `Terlalu gelap (−${amount} stop)`
  return { difference, brightness, label }
}
