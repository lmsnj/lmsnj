// Penilaian langsung (Mapel Umum Tahap 3). Rumus skala SAMA dengan backend apps/grading/scales.py:
// 0-100 = angka itu; 0-4 = angka x 25; predikat = nilai tengah rentang ((min + min di atasnya) // 2).
// Di sini hanya untuk tanda merah & pesan langsung; backend tetap yang memeriksa dan menyimpan.

export const SCALE_LABELS = { '0-100': '0–100', '0-4': '0–4', predikat: 'Predikat' }

/** { label: nilai skala 100 } dari rentang predikat [{ label, min }] (urut dari tertinggi). */
export function predicateScores(bands) {
  const scores = {}
  let upper = 100
  for (const band of bands ?? []) {
    scores[band.label] = Math.floor((band.min + upper) / 2)
    upper = band.min
  }
  return scores
}

/**
 * Periksa isian: { score } (nilai skala 100, null jika kosong) atau { error }.
 * Koma desimal diterima ("87,5").
 */
export function checkValue(scale, raw, bands) {
  const text = String(raw ?? '').trim()
  if (!text) return { score: null }
  if (scale === 'predikat') {
    const scores = predicateScores(bands)
    const label = Object.keys(scores).find((name) => name.toUpperCase() === text.toUpperCase())
    if (label === undefined)
      return { error: `Pilih salah satu: ${Object.keys(scores).join(', ')}.` }
    return { score: scores[label] }
  }
  const high = scale === '0-4' ? 4 : 100
  if (!/^\d+([.,]\d{1,2})?$/.test(text)) {
    return {
      error: /^\d+[.,]\d{3,}$/.test(text)
        ? 'Maksimal 2 angka di belakang koma.'
        : 'Isi dengan angka.',
    }
  }
  const number = Number(text.replace(',', '.'))
  if (number > high) return { error: `Isi angka 0–${high}.` }
  return { score: scale === '0-4' ? Math.round(number * 25 * 100) / 100 : number }
}

/** Di bawah KKM? (hanya untuk siswa hadir yang sudah bernilai). */
export function isBelowKkm(score, kkm) {
  return score !== null && score !== undefined && score !== '' && Number(score) < kkm
}

/** Baris yang diisi "Isi yang kosong dengan": siswa hadir yang belum bernilai. */
export function fillEmpty(rows) {
  return rows
    .filter((row) => row.status !== 'tidak_hadir' && !String(row.value ?? '').trim())
    .map((row) => row.student)
}

/** Ringkasan grid: dinilai (nilai sah), tidak hadir, belum (kosong/isian salah), di bawah KKM. */
export function gridSummary(rows, kkm) {
  const summary = { graded: 0, absent: 0, empty: 0, below: 0 }
  for (const row of rows) {
    if (row.status === 'tidak_hadir') summary.absent += 1
    else if (row.score !== null && row.score !== undefined && String(row.value ?? '').trim()) {
      summary.graded += 1
      if (isBelowKkm(row.score, kkm)) summary.below += 1
    } else summary.empty += 1
  }
  return summary
}
