// Fungsi murni Kuis Kartu QR (Mapel Umum Tahap 5). Ada test-nya di qrQuiz.test.js.
//
// Kartu: QR berisi "SG:<nomor>" di tengah, huruf A di sisi atas, B kanan, C bawah, D kiri (saat QR
// tegak). Siswa memutar kartu sehingga huruf jawabannya di atas, jadi ARAH QR = jawaban.

export const LETTERS = ['A', 'B', 'C', 'D']
const CARD_PATTERN = /^SG:(\d{1,3})$/

export const cardText = (number) => `SG:${number}`

/** Nomor kartu dari isi QR, atau null jika bukan kartu kuis. */
export function parseCard(text) {
  const match = CARD_PATTERN.exec(String(text ?? '').trim())
  const number = match ? Number(match[1]) : 0
  return number >= 1 ? number : null
}

/**
 * Sudut putar QR dalam derajat (-180..180, sumbu y layar mengarah ke bawah): arah garis sudut
 * kiri-atas -> kanan-atas QR. 0 = tegak, -90 = sisi kanan kartu di atas, 90 = sisi kiri di atas.
 */
export function rotationOf(position) {
  const { topLeft, topRight } = position
  return (Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x) * 180) / Math.PI
}

/**
 * Pilihan (0 = A ... 3 = D) dari posisi QR: huruf yang berada di atas.
 * Tegak = A; diputar sehingga sisi kanan (B) di atas = garis atas QR menunjuk ke atas (-90), dst.
 */
export function optionFromPosition(position) {
  const angle = rotationOf(position)
  const quarter = Math.round(-angle / 90) // 0 A, 1 B, ±2 C, -1 D
  return ((quarter % 4) + 4) % 4
}

/** Hasil satu gambar kamera -> [{card, option}] (kartu ganda dalam satu gambar: yang pertama). */
export function readsFromResults(results) {
  const seen = new Map()
  for (const result of results) {
    const card = parseCard(result.text)
    if (card === null || seen.has(card) || !result.position) continue
    seen.set(card, optionFromPosition(result.position))
  }
  return [...seen].map(([card, option]) => ({ card, option }))
}

/**
 * Bacaan stabil: kartu dianggap terbaca jika pilihan yang SAMA terlihat di `need` gambar berturut-
 * turut (kartu yang sedang diangkat/diputar tidak ikut tersimpan). `streaks` = Map kartu ->
 * {option, count} dari gambar sebelumnya; mengembalikan {streaks, stable: [{card, option}]}.
 */
export function updateStreaks(streaks, reads, need = 2) {
  const next = new Map()
  const stable = []
  for (const { card, option } of reads) {
    const before = streaks.get(card)
    const count = before && before.option === option ? before.count + 1 : 1
    next.set(card, { option, count })
    if (count === need) stable.push({ card, option })
  }
  return { streaks: next, stable }
}

/** Jawaban satu soal per siswa: Map student -> {option, correct, card}. */
export function answersFor(answers, question) {
  const map = new Map()
  for (const answer of answers) {
    if (answer.question === question) map.set(answer.student, answer)
  }
  return map
}

/** Rekap satu soal untuk grafik TV: jumlah per pilihan + total terbaca + benar. */
export function tally(answers, question, optionCount) {
  const counts = Array.from({ length: optionCount }, () => 0)
  let correct = 0
  let total = 0
  for (const answer of answersFor(answers, question).values()) {
    if (answer.option < optionCount) counts[answer.option] += 1
    total += 1
    if (answer.correct) correct += 1
  }
  return { counts, total, correct }
}

/** Siswa berkartu (peta kartu) dan berapa yang sudah terbaca di soal ini. */
export function rosterStatus(roster, answers, question) {
  const read = answersFor(answers, question)
  const withCard = roster.filter((row) => row.number)
  const rows = withCard.map((row) => ({ ...row, answer: read.get(row.student) ?? null }))
  return {
    rows,
    read: rows.filter((row) => row.answer).length,
    total: withCard.length,
    noCard: roster.length - withCard.length,
  }
}

/** Nomor kartu yang akan dicetak: 1..jumlah (dibatasi 1..200). */
export function cardNumbers(from, to) {
  const start = Math.max(1, Math.min(200, Number(from) || 1))
  const end = Math.max(start, Math.min(200, Number(to) || start))
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

/** Kartu per lembar A4: A5 = 2 (atas-bawah), A6 = 4 (2 x 2). */
export const CARDS_PER_SHEET = { A5: 2, A6: 4 }

/** Soal kosong untuk form (jumlah pilihan = pengaturan kuis_qr.jumlah_opsi). */
export function emptyQuestion(optionCount) {
  return { text: '', choices: Array.from({ length: optionCount }, () => ''), correct: 0 }
}
