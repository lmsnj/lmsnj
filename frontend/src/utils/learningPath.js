// Fungsi murni capaian materi (urutan & kunci). Aturannya di backend apps/materials/progress.py;
// di sini hanya tampilan. Ada test-nya di learningPath.test.js.

/** Status satu materi bagi siswa: { label, color } untuk Badge. `progress` dari API (khusus siswa). */
export function progressStatus(progress) {
  if (!progress) return null
  if (progress.locked) return { label: 'Terkunci', color: 'gray' }
  if (progress.completed) {
    return { label: progress.unlocked ? 'Dibuka guru' : 'Tercapai', color: 'green' }
  }
  if (!progress.opened) return { label: 'Belum dibuka', color: 'blue' }
  const { done, total } = countChecks(progress.checks)
  return { label: `Sedang dipelajari (${done}/${total})`, color: 'amber' }
}

export function countChecks(checks = []) {
  return { done: checks.filter((check) => check.done).length, total: checks.length }
}

/** Ringkasan progres satu mapel: berapa materi tercapai dari seluruhnya. */
export function pathSummary(materials = []) {
  const withProgress = materials.filter((m) => m.progress)
  const completed = withProgress.filter((m) => m.progress.completed).length
  const next = withProgress.find((m) => !m.progress.completed && !m.progress.locked)
  return { total: withProgress.length, completed, next: next ?? null }
}

/** Pindahkan item ke atas (-1) / bawah (+1); daftar baru (tidak mengubah yang lama). */
export function moveItem(items, index, delta) {
  const target = index + delta
  if (target < 0 || target >= items.length) return items
  const copy = [...items]
  ;[copy[index], copy[target]] = [copy[target], copy[index]]
  return copy
}

/** Teks capaian dari textarea (satu per baris) -> daftar; baris kosong dibuang. */
export function parseObjectives(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** Daftar indeks capaian setelah satu capaian dicentang/dilepas. */
export function toggleObjective(checked, index) {
  return checked.includes(index)
    ? checked.filter((i) => i !== index)
    : [...checked, index].sort((a, b) => a - b)
}
