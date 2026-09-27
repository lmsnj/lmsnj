// Penyaring umum untuk halaman daftar (tugas, asesmen, obrolan). Fungsi murni agar mudah diuji.
// Data dimuat sekali (ALL), lalu disaring di browser: angka di panel selalu sesuai dengan daftar.

export const EMPTY_FILTERS = { search: '', assignment: '', status: '' }

export const normalizeText = (text) =>
  String(text ?? '')
    .toLowerCase()
    .trim()

// Semua kata pencarian harus ada di `text` (tanpa beda huruf besar/kecil).
export function matchesSearch(text, search) {
  const haystack = normalizeText(text)
  return normalizeText(search)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word))
}

/**
 * Saring daftar dengan { search, assignment, status }.
 * - `textOf(item)`: teks yang dicari (mis. judul + mapel)
 * - `statuses`: [{ id, match(item) }] — `status` terpilih harus cocok
 * - item dicocokkan ke pengampu lewat `item.teaching_assignment`
 */
export function filterList(items, filters, { textOf, statuses = [] }) {
  const status = statuses.find((s) => s.id === filters.status)
  return (items ?? []).filter(
    (item) =>
      (!filters.assignment || String(item.teaching_assignment) === String(filters.assignment)) &&
      (!status || status.match(item)) &&
      matchesSearch(textOf(item), filters.search),
  )
}

// Jumlah item per status: { id: jumlah }.
export function countStatuses(items, statuses) {
  return Object.fromEntries(statuses.map((s) => [s.id, (items ?? []).filter(s.match).length]))
}

// Jumlah item per pengampu: { idPengampu: jumlah }.
export function countByAssignment(items) {
  const counts = {}
  for (const item of items ?? []) {
    counts[item.teaching_assignment] = (counts[item.teaching_assignment] ?? 0) + 1
  }
  return counts
}

/** Label penyaring aktif untuk FilterChips: [{ key, label }]. */
export function filterChips(filters, { assignments, assignmentLabel, options }) {
  const assignment = assignments?.find((a) => String(a.id) === String(filters.assignment))
  const option = options?.find((o) => o.id === filters.status)
  return [
    assignment && { key: 'assignment', label: assignmentLabel(assignment) },
    option && { key: 'status', label: option.title },
    filters.search?.trim() && { key: 'search', label: `“${filters.search.trim()}”` },
  ].filter(Boolean)
}
