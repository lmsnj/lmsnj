// Logika halaman mengerjakan soal (mode ujian siswa). Fungsi murni agar mudah diuji (npm test).
//
// Bentuk jawaban per jenis soal (disimpan di state `answers[questionId]`):
// - choice   (PG sederhana): nomor pilihan, mis. 2
// - multiple (PG kompleks) : daftar nomor pilihan yang dicentang, mis. [0, 2]
// - category (kategori)    : untuk setiap pernyataan, nomor label (0 = label pertama) atau null
// - essay                  : teks

const DEFAULT_LABELS = ['Benar', 'Salah']

export const categoryLabels = (question) =>
  question.category_labels?.length === 2 ? question.category_labels : DEFAULT_LABELS

export function isAnswered(question, value) {
  switch (question.kind) {
    case 'choice':
      return Number.isInteger(value)
    case 'multiple':
      return Array.isArray(value) && value.length > 0
    case 'category':
      return Array.isArray(value) && question.choices.every((_, i) => Number.isInteger(value[i]))
    default:
      return String(value ?? '').trim() !== ''
  }
}

// Status tombol nomor soal: 'current' | 'flagged' | 'answered' | 'empty'.
export function questionStatus({ answered, flagged, current }) {
  if (current) return 'current'
  if (flagged) return 'flagged'
  return answered ? 'answered' : 'empty'
}

// Teks "Petunjuk Pengerjaan" yang menyesuaikan bentuk soal.
export function instructionFor(question) {
  switch (question.kind) {
    case 'choice':
      return 'Silakan klik pilihan jawabanmu.'
    case 'multiple':
      return 'Pilih lebih dari satu jawaban yang benar.'
    case 'category': {
      const [first, second] = categoryLabels(question)
      return `Tentukan ${first} atau ${second} untuk setiap pernyataan.`
    }
    default:
      return 'Tulis jawabanmu pada kotak yang tersedia.'
  }
}

// PG kompleks: centang/batal centang satu pilihan (hasil selalu urut).
export function toggleChoice(value, index) {
  const current = Array.isArray(value) ? value : []
  const next = current.includes(index) ? current.filter((i) => i !== index) : [...current, index]
  return next.sort((a, b) => a - b)
}

// Kategori: isi jawaban satu pernyataan.
export function setCategory(question, value, statement, label) {
  const current = Array.isArray(value) ? value : []
  return question.choices.map((_, i) => (i === statement ? label : (current[i] ?? null)))
}

// Tombol A-E di keyboard -> nomor pilihan (0-4); -1 jika bukan huruf pilihan.
export function choiceKeyIndex(key) {
  const index = 'abcde'.indexOf(String(key).toLowerCase())
  return String(key).length === 1 ? index : -1
}

const hasStimulus = (q) => Boolean(q.stimulus?.trim() || q.images?.stimulus)

/**
 * Soal grup: untuk setiap soal, stimulus bersama dari soal pertama di grupnya yang punya stimulus.
 * Mengembalikan daftar sejajar `questions`: null, atau { source, from, to } (nomor soal 1-based).
 */
export function sharedStimuli(questions) {
  const groups = new Map()
  questions.forEach((q, index) => {
    if (!q.group) return
    const group = groups.get(q.group) ?? { members: [], source: null }
    group.members.push(index)
    if (!group.source && hasStimulus(q)) group.source = q
    groups.set(q.group, group)
  })
  return questions.map((q) => {
    const group = q.group ? groups.get(q.group) : null
    if (!group?.source || group.members.length < 2) return null
    return { source: group.source, from: group.members[0] + 1, to: group.members.at(-1) + 1 }
  })
}

// Satu jawaban dalam format API (dipakai untuk simpan sementara dan kumpulkan).
export function answerPayload(question, value, flagged = false) {
  const item = { question: question.id }
  if (question.kind === 'choice') item.choice = Number.isInteger(value) ? value : null
  else if (question.kind === 'multiple') item.choices = Array.isArray(value) ? value : []
  else if (question.kind === 'category') {
    item.choices = question.choices.map((_, i) =>
      Array.isArray(value) ? (value[i] ?? null) : null,
    )
  } else item.text = value ?? ''
  if (flagged) item.flagged = true
  return item
}

export const toPayload = (questions, answers, flags = {}) =>
  questions.map((q) => answerPayload(q, answers[q.id], Boolean(flags[q.id])))

// Jawaban sementara dari server -> { answers, flags }.
export function fromServerDraft(questions, draft) {
  const byId = new Map(questions.map((q) => [q.id, q]))
  const answers = {}
  const flags = {}
  for (const item of draft ?? []) {
    const question = byId.get(item.question)
    if (!question) continue
    if (question.kind === 'choice') answers[item.question] = item.choice ?? null
    else if (question.kind === 'essay') answers[item.question] = item.text ?? ''
    else answers[item.question] = item.choices ?? []
    if (item.flagged) flags[item.question] = true
  }
  return { answers, flags }
}

/**
 * Pulihkan keadaan ujian: salinan di perangkat (localStorage) lebih dulu, lalu jawaban sementara
 * di server (pindah perangkat / cache terhapus). `saved` = isi localStorage (sudah di-parse).
 */
export function restoreExamState(saved, questions, serverDraft) {
  const last = Math.max(questions.length - 1, 0)
  const clamp = (value) => Math.min(Math.max(Number(value) || 0, 0), last)
  if (saved && typeof saved === 'object') {
    if (saved.answers) {
      return { answers: saved.answers, flags: saved.flags ?? {}, current: clamp(saved.current) }
    }
    // Format lama: objek jawaban saja.
    if (Object.keys(saved).length) return { answers: saved, flags: {}, current: 0 }
  }
  return { ...fromServerDraft(questions, serverDraft), current: 0 }
}
