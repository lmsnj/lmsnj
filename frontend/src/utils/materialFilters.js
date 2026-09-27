// Penyaring & penghitung materi untuk halaman "Materi Pembelajaran". Fungsi murni agar mudah diuji.
// Materi dimuat sekali (ALL), lalu disaring di browser: angka di kartu mapel/tipe selalu sesuai.

const normalize = (text) =>
  String(text ?? '')
    .toLowerCase()
    .trim()

/** `filters`: { search, assignment (id pengampu), type ('pdf' | 'video' | 'link') } */
export function filterMaterials(materials, { search = '', assignment = '', type = '' } = {}) {
  const words = normalize(search).split(/\s+/).filter(Boolean)
  return (materials ?? []).filter((m) => {
    if (assignment && String(m.teaching_assignment) !== String(assignment)) return false
    if (type && m.material_type !== type) return false
    const haystack = normalize(`${m.title} ${m.description} ${m.subject_name}`)
    return words.every((word) => haystack.includes(word))
  })
}

// Jumlah materi per nilai field, mis. countBy(materials, 'material_type') -> { pdf: 3, video: 1 }.
export function countBy(materials, field) {
  const counts = {}
  for (const m of materials ?? []) counts[m[field]] = (counts[m[field]] ?? 0) + 1
  return counts
}

// Ikon kartu mapel ditebak dari nama mapel (kata kunci). Urutan penting: yang lebih khusus dulu.
const SUBJECT_ICONS = [
  ['math', ['matematika', 'mtk']],
  ['english', ['inggris', 'english']],
  ['arabic', ['arab', 'nahwu', 'shorof']],
  ['religion', ['agama', 'fiqih', 'fikih', 'akidah', 'aqidah', 'quran', 'hadits', 'hadis', 'pai']],
  ['language', ['bahasa', 'sastra']],
  ['database', ['basis data', 'database']],
  ['network', ['jaringan', 'jarkom', 'tkj', 'network']],
  [
    'code',
    ['pemrograman', 'program', 'web', 'coding', 'rpl', 'pbo', 'perangkat lunak', 'informatika'],
  ],
  ['biology', ['biologi']],
  ['chemistry', ['kimia']],
  ['physics', ['fisika', 'ipa', 'sains']],
  ['history', ['sejarah', 'ips', 'geografi', 'pancasila', 'pkn', 'ppkn']],
  ['art', ['seni', 'budaya', 'desain']],
  ['sport', ['olahraga', 'pjok', 'penjas']],
  ['business', ['ekonomi', 'akuntansi', 'kewirausahaan', 'bisnis', 'pkk']],
]

export function subjectIconKey(name) {
  const text = normalize(name)
  const found = SUBJECT_ICONS.find(([, words]) => words.some((word) => text.includes(word)))
  return found ? found[0] : 'default'
}
