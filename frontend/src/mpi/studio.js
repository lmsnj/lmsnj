/**
 * Fungsi murni Studio Penyusun (diuji di studio.test.js): membuat, menyusun ulang, menduplikat, dan
 * menghapus bagian/stasiun/langkah di draf media. Draf tidak pernah diubah langsung (immutable), jadi
 * React tahu kapan harus menggambar ulang dan "Batal" mudah.
 *
 * Alamat (path) item di outline:
 *   { part }                          -> bagian
 *   { part, station }                 -> stasiun
 *   { part, station, list, step }     -> langkah (list = 'steps' | 'remedial' | 'challenge')
 */

export function newId(prefix = 'x') {
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}${Date.now().toString(36).slice(-5)}${random}`
}

// Isi awal tiap jenis langkah: sudah lengkap & valid, guru tinggal mengganti teksnya.
const STEP_DEFAULTS = {
  text: () => ({ body: 'Tulis penjelasan singkat di sini.' }),
  did_you_know: () => ({ body: 'Fakta menarik yang berhubungan dengan materi.' }),
  dialog: () => ({
    lines: [
      {
        speaker: 'mascot',
        mood: 'happy',
        text: 'Halo {nama_panggilan}! Hari ini kita belajar hal baru.',
      },
      { speaker: 'student', mood: '', text: 'Siap!' },
    ],
  }),
  video: () => ({ url: '', start: 0, body: '' }),
  link: () => ({ url: 'https://', label: '', body: '' }),
  flip_cards: () => ({ cards: [{ front: 'Istilah', back: 'Artinya' }] }),
  flashcards: () => ({ cards: [{ front: 'Pertanyaan', back: 'Jawaban' }] }),
  worked_example: () => ({
    body: 'Contoh soal.',
    steps: [
      { text: 'Langkah 1', explain: 'Kenapa langkah ini dilakukan.' },
      { text: 'Langkah 2', explain: '' },
    ],
  }),
  choice: () => ({
    text: 'Tulis pertanyaan di sini.',
    choices: [
      { text: 'Jawaban benar', why: '' },
      { text: 'Pilihan salah', why: 'Jelaskan kenapa pilihan ini salah.' },
      { text: 'Pilihan salah lain', why: '' },
    ],
    correct: 0,
    explanation: '',
  }),
  true_false: () => ({
    text: 'Tulis pernyataan.',
    answer: true,
    why_true: '',
    why_false: '',
    explanation: '',
  }),
  ordering: () => ({
    text: '',
    items: ['Langkah pertama', 'Langkah kedua', 'Langkah ketiga'],
    why: '',
    explanation: '',
  }),
  categorize: () => ({
    text: '',
    categories: ['Kelompok A', 'Kelompok B'],
    items: [
      { text: 'Butir 1', category: 0, why: '' },
      { text: 'Butir 2', category: 1, why: '' },
    ],
    explanation: '',
  }),
  hotspot: () => ({
    text: 'Ketuk bagian yang tepat.',
    image: '',
    show_labels: true,
    areas: [
      { x: 10, y: 10, w: 20, h: 15, label: 'Benar', correct: true, why: '' },
      { x: 60, y: 60, w: 20, h: 15, label: 'Salah', correct: false, why: '' },
    ],
    explanation: '',
  }),
  fill_blank: () => ({
    text: '',
    template: 'Ibu kota Indonesia adalah [[Jakarta]].',
    case_sensitive: false,
    why: '',
    explanation: '',
  }),
  drag_drop: () => ({
    text: '',
    template: 'Simbol [[Input]] berbentuk jajaran genjang.',
    distractors: ['Output'],
    why: '',
    explanation: '',
  }),
  matching: () => ({
    text: 'Pasangkan dengan tepat.',
    pairs: [
      { left: 'Input', right: 'Membaca data' },
      { left: 'Output', right: 'Menampilkan hasil' },
    ],
    distractors: [],
    why: '',
    explanation: '',
  }),
}

export const STEP_KINDS = Object.keys(STEP_DEFAULTS)

// Jenis latihan (dinilai). Plugin menambah jenisnya lewat registerStudioKind.
export const GRADED_KINDS = new Set([
  'choice',
  'true_false',
  'ordering',
  'categorize',
  'hotspot',
  'fill_blank',
  'drag_drop',
  'matching',
])

/** Plugin mapel: daftarkan isi awal jenis langkahnya agar muncul di pilihan "+ Langkah" Studio. */
export function registerStudioKind(kind, make, graded = false) {
  STEP_DEFAULTS[kind] = make
  if (!STEP_KINDS.includes(kind)) STEP_KINDS.push(kind)
  if (graded) GRADED_KINDS.add(kind)
}

export function newStep(kind) {
  const make = STEP_DEFAULTS[kind]
  if (!make) throw new Error(`Jenis langkah tidak dikenal: ${kind}`)
  return { id: newId('l'), kind, title: '', hints: [], ...make() }
}

const withKind = (kind, changes = {}) => ({ ...newStep(kind), ...changes })

// Template stasiun siap pakai.
export const STATION_TEMPLATES = {
  concept: {
    label: 'Stasiun konsep',
    description: 'Dialog maskot, penjelasan, contoh, lalu satu latihan.',
    steps: () => [
      withKind('dialog'),
      withKind('text'),
      withKind('worked_example'),
      withKind('choice'),
    ],
  },
  practice: {
    label: 'Stasiun latihan',
    description: 'Empat latihan berbeda untuk menguatkan pemahaman.',
    steps: () => [
      withKind('choice'),
      withKind('true_false'),
      withKind('ordering'),
      withKind('fill_blank'),
    ],
  },
  case: {
    label: 'Studi kasus',
    description: 'Cerita masalah, contoh penyelesaian, lalu latihan menerapkan.',
    steps: () => [
      withKind('text', { body: 'Ceritakan masalah nyata yang dekat dengan siswa.' }),
      withKind('worked_example'),
      withKind('categorize'),
      withKind('choice'),
    ],
  },
  quiz: {
    label: 'Kuis',
    description: 'Tiga soal pilihan ganda untuk mengecek pemahaman.',
    steps: () => [withKind('choice'), withKind('choice'), withKind('choice')],
  },
  empty: { label: 'Kosong', description: 'Satu langkah teks.', steps: () => [withKind('text')] },
}

export function newStation(template = 'concept', title = 'Stasiun baru') {
  return {
    id: newId('s'),
    title,
    objectives: [],
    minutes: 10,
    prerequisites: [],
    optional: false,
    badge: null,
    steps: STATION_TEMPLATES[template].steps(),
    summary: [],
    reflection: 'Apa yang paling kamu pahami? Apa yang masih membingungkan?',
    remedial: [],
    challenge: [],
  }
}

export function newPart(title = 'Bagian baru') {
  return { id: newId('p'), title, description: '', stations: [newStation('concept', 'Stasiun 1')] }
}

export function emptyDraft() {
  return {
    schema_version: 1,
    mascot: { name: 'Bita', image: '' },
    glossary: [],
    parts: [newPart('Bagian 1')],
  }
}

// ---------------------------------------------------------------- operasi daftar

export function moveInList(list, index, delta) {
  const target = index + delta
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function removeFromList(list, index) {
  return list.filter((_, i) => i !== index)
}

/** Salinan dengan id BARU di semua tingkat (progres siswa terikat id, jadi duplikat harus beda id). */
export function cloneWithNewIds(item) {
  const copy = structuredClone(item)
  const renew = (node, prefix) => ({ ...node, id: newId(prefix) })
  if ('stations' in copy) {
    return {
      ...renew(copy, 'p'),
      stations: copy.stations.map((station) => cloneWithNewIds(station)),
    }
  }
  if ('steps' in copy && 'remedial' in copy) {
    return {
      ...renew(copy, 's'),
      prerequisites: [],
      steps: copy.steps.map((step) => renew(step, 'l')),
      remedial: copy.remedial.map((step) => renew(step, 'l')),
      challenge: copy.challenge.map((step) => renew(step, 'l')),
    }
  }
  return renew(copy, 'l')
}

export function duplicateInList(list, index) {
  const copy = cloneWithNewIds(list[index])
  if (copy.title) copy.title = `${copy.title} (salinan)`
  return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)]
}

// ---------------------------------------------------------------- alamat (path)

/** Apakah dua alamat menunjuk item yang sama ('media' = pengaturan media). */
export const samePath = (a, b) =>
  Boolean(a && b) &&
  typeof a === 'object' &&
  typeof b === 'object' &&
  a.part === b.part &&
  a.station === b.station &&
  a.list === b.list &&
  a.step === b.step

export function getAt(draft, path) {
  const part = draft.parts[path.part]
  if (path.station === undefined) return part
  const station = part?.stations[path.station]
  if (path.step === undefined) return station
  return station?.[path.list]?.[path.step]
}

/** Ganti item di `path` dengan updater(item lama). */
export function updateAt(draft, path, updater) {
  const parts = draft.parts.map((part, p) => {
    if (p !== path.part) return part
    if (path.station === undefined) return updater(part)
    return {
      ...part,
      stations: part.stations.map((station, s) => {
        if (s !== path.station) return station
        if (path.step === undefined) return updater(station)
        return {
          ...station,
          [path.list]: station[path.list].map((step, i) =>
            i === path.step ? updater(step) : step,
          ),
        }
      }),
    }
  })
  return { ...draft, parts }
}

/** Daftar induk yang memuat item di `path` -> { list, index, apply(listBaru) -> draf baru }. */
export function containerOf(draft, path) {
  if (path.station === undefined) {
    return { list: draft.parts, index: path.part, apply: (parts) => ({ ...draft, parts }) }
  }
  if (path.step === undefined) {
    return {
      list: draft.parts[path.part].stations,
      index: path.station,
      apply: (stations) => updateAt(draft, { part: path.part }, (part) => ({ ...part, stations })),
    }
  }
  const stationPath = { part: path.part, station: path.station }
  return {
    list: getAt(draft, stationPath)[path.list],
    index: path.step,
    apply: (steps) =>
      updateAt(draft, stationPath, (station) => ({ ...station, [path.list]: steps })),
  }
}

/** Ringkasan isi untuk Studio: jumlah bagian/stasiun/langkah/latihan. */
export function draftStats(draft) {
  let stations = 0
  let steps = 0
  let practice = 0
  const graded = GRADED_KINDS
  for (const part of draft.parts ?? []) {
    for (const station of part.stations ?? []) {
      stations += 1
      for (const step of station.steps ?? []) {
        steps += 1
        if (graded.has(step.kind)) practice += 1
      }
    }
  }
  return { parts: draft.parts?.length ?? 0, stations, steps, practice }
}

/** Teks satu baris per butir <-> daftar (untuk tujuan, ringkasan, petunjuk, pengecoh). */
export const linesToList = (text) =>
  String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
export const listToLines = (list) => (list ?? []).join('\n')

// Sumber impor isi media (pasangan `backend/apps/learning_media/importers/service.py`).
export const IMPORT_SOURCES = {
  excel: { accept: '.xlsx,.csv', maxMb: 10 },
  json: { accept: '.json,application/json', maxMb: 3 },
  word: { accept: '.docx', maxMb: 25 },
  pptx: { accept: '.pptx', maxMb: 40 },
  pdf: { accept: '.pdf,application/pdf', maxMb: 25 },
  fprg: { accept: '.fprg', maxMb: 1 },
  links: {},
  bank: {},
}

/**
 * Mode impor bawaan. Excel & JSON biasanya berisi SELURUH media (template berisi isi draf), jadi "ganti";
 * sumber lain menambah isi baru di belakang.
 */
export function defaultImportMode(source, hasContent) {
  if (!hasContent) return 'append'
  return source === 'excel' || source === 'json' ? 'replace' : 'append'
}

/** Isian impor siap kirim, atau pesan kenapa belum bisa diperiksa. */
export function importPayload({ source, mode, file, text, assessment, questions }) {
  const rules = IMPORT_SOURCES[source]
  if (!rules) return { error: 'Pilih sumber impor.' }
  if (rules.accept) {
    if (!file) return { error: 'Pilih file yang akan diimpor.' }
    if (file.size > rules.maxMb * 1024 * 1024)
      return { error: `Ukuran file maksimal ${rules.maxMb} MB.` }
    return { data: { source, mode, file } }
  }
  if (source === 'links') {
    if (!String(text || '').trim()) return { error: 'Tulis minimal satu tautan.' }
    return { data: { source, mode, text } }
  }
  if (!assessment) return { error: 'Pilih asesmen yang akan diambil soalnya.' }
  if (questions && questions.length === 0) return { error: 'Pilih minimal satu soal.' }
  return { data: { source, mode, assessment: Number(assessment), questions: questions ?? [] } }
}
