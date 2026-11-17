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

/**
 * Keadaan Latihan Pemahaman satu materi bagi siswa: { count, passed, ready, blocked }.
 * ready = semua konten sudah dibuka (latihan boleh dikerjakan). blocked = Cerita Reflektif belum
 * boleh ditulis karena latihan belum lulus. Aturannya di backend (views.practice / reflection).
 */
export function practiceState(material) {
  const count = material.practice_count ?? 0
  const progress = material.progress
  const opened = progress?.checks?.find((check) => check.key === 'opened')
  const passed = Boolean(progress?.practice_passed)
  return {
    count,
    passed,
    ready: Boolean(opened?.done),
    blocked: count > 0 && !passed,
  }
}

/**
 * Daftar aktivitas satu materi (tampilan modul siswa), urut seperti langkah belajar:
 * isi materi (konten utama + konten tambahan) -> Latihan Pemahaman -> capaian (uji capaian jika
 * berkuis) -> tugas -> asesmen -> pengesahan guru. Cerita reflektif ditampilkan terpisah.
 * Setiap item: { key, kind, label, done, type?, contentItem?, index?, quizCount?, ready? }; untuk isi
 * materi `contentItem` = konten tambahan (null = konten utama materi).
 */
export function moduleActivities(material) {
  const progress = material.progress
  const checked = progress?.checked_objectives ?? []
  const openedItems = progress?.opened_items ?? []
  const quizCounts = material.objective_quiz ?? []
  const items = [
    {
      key: 'content',
      kind: 'content',
      label: material.title,
      type: material.material_type,
      contentItem: null,
      done: Boolean(progress?.opened),
    },
  ]
  for (const contentItem of material.items ?? []) {
    items.push({
      key: `item-${contentItem.id}`,
      kind: 'content',
      label: contentItem.title,
      type: contentItem.material_type,
      contentItem,
      done: openedItems.includes(contentItem.id),
    })
  }
  const practice = practiceState(material)
  if (practice.count) {
    items.push({
      key: 'practice',
      kind: 'practice',
      label: 'Latihan Pemahaman',
      quizCount: practice.count,
      ready: practice.ready,
      done: practice.passed,
    })
  }
  ;(material.objectives ?? []).forEach((text, index) => {
    const quizCount = quizCounts[index] ?? 0
    items.push({
      key: `objective-${index}`,
      kind: quizCount ? 'quiz' : 'objective',
      label: quizCount ? `Uji capaian: ${text}` : text,
      index,
      quizCount,
      done: checked.includes(index),
    })
  })
  for (const check of progress?.checks ?? []) {
    if (['task', 'assessment', 'approval'].includes(check.key)) {
      items.push({ key: check.key, kind: check.key, label: check.label, done: check.done })
    }
  }
  return items
}

/** Materi yang dibuka pertama kali di tampilan modul: yang sedang dipelajari, atau materi pertama. */
export function defaultModuleId(materials = []) {
  return pathSummary(materials).next?.id ?? materials[0]?.id ?? null
}
