/**
 * "Mesin" pemutar Media Pembelajaran Interaktif (fungsi murni, diuji di engine.test.js).
 * Isi media datang dari API sebagai data; tidak ada isi materi yang ditulis di kode.
 */

const PLACEHOLDER = /\{(nama_siswa|nama_panggilan|kelas)\}/g

/** Sapaan personal: {nama_siswa}, {nama_panggilan}, {kelas}. Penanda lain dibiarkan apa adanya. */
export function personalize(text, user) {
  if (!text) return ''
  const fullName = (user?.full_name || '').trim()
  const values = {
    nama_siswa: fullName || 'kamu',
    nama_panggilan: fullName.split(/\s+/)[0] || 'kamu',
    kelas: user?.classroom_name || 'kelasmu',
  }
  return String(text).replace(PLACEHOLDER, (_, key) => values[key])
}

/** "asset:12" -> alamat API gambar unggahan (diambil dengan token lewat AuthImage). */
export function assetUrl(src) {
  const match = /^asset:(\d+)$/.exec(src || '')
  return match ? `/media-assets/${match[1]}/` : null
}

/** Semua stasiun berurutan dengan nomor global dan judul bagiannya. */
export function flattenStations(content) {
  const list = []
  ;(content?.parts ?? []).forEach((part, partIndex) => {
    part.stations.forEach((station) => {
      list.push({
        ...station,
        partId: part.id,
        partTitle: part.title,
        partIndex,
        number: list.length + 1,
      })
    })
  })
  return list
}

/** Keadaan stasiun untuk peta: locked / done / progress (sudah mulai) / open. */
export function stationStatus(state) {
  if (!state) return 'open'
  if (state.locked) return 'locked'
  if (state.completed) return 'done'
  if (state.last_step_id || Object.keys(state.run ?? {}).length) return 'progress'
  return 'open'
}

export function stepLabel(index, total) {
  return `Langkah ${index + 1} dari ${total}`
}

/** Jawaban awal sebelum siswa menyentuh apa pun (urutkan: urutan yang sedang tampil). */
export function initialValue(step) {
  if (step.kind === 'ordering') return { order: step.items.map((item) => item.id) }
  return undefined
}

/** Apakah jawaban sudah lengkap sehingga tombol "Periksa" boleh ditekan. */
export function isAnswered(step, value) {
  if (!value) return false
  switch (step.kind) {
    case 'choice':
      return Boolean(value.choice)
    case 'true_false':
      return typeof value.answer === 'boolean'
    case 'ordering':
      return Array.isArray(value.order) && value.order.length === step.items.length
    case 'categorize':
      return step.items.every((item) => value.items?.[item.id])
    case 'hotspot':
      return Boolean(value.area)
    case 'fill_blank':
      return (
        (value.gaps ?? []).filter((gap) => String(gap ?? '').trim()).length ===
        step.parts.length - 1
      )
    case 'drag_drop':
      return (value.gaps ?? []).filter(Boolean).length === step.parts.length - 1
    case 'matching':
      return Object.keys(value.pairs ?? {}).length === step.left.length
    default:
      // Jenis dari plugin menentukan sendiri lewat registri komponen; di sini anggap terisi.
      return true
  }
}

/** Langkah boleh dilewati jika penjelasan, atau latihan yang sudah tuntas (benar / dibuka jawabannya). */
export function canAdvance(step, stepState) {
  return !step.graded || Boolean(stepState?.done)
}

/** Jumlah latihan utama yang sudah tuntas di percobaan berjalan. */
export function stationProgress(station, run) {
  const graded = station.steps.filter((step) => step.graded)
  const done = graded.filter((step) => run?.[step.id]?.done).length
  return { done, total: graded.length, complete: done === graded.length }
}

/**
 * Status langkah setelah menjawab, dihitung di browser untuk pratinjau / mode lihat saja (server tidak
 * menyimpan, jadi tidak mengembalikan `step_state`). Aturannya sama dengan server.
 */
export function localStepState(previous, { correct, revealed, hintLevel = 0, hintCount = 0 }) {
  const state = { ...(previous ?? {}) }
  if (state.done) return state
  state.hints = Math.max(state.hints ?? 0, revealed ? hintCount : hintLevel)
  if (revealed) return { ...state, done: true, revealed: true }
  if (correct) return { ...state, done: true }
  return { ...state, mistakes: (state.mistakes ?? 0) + 1 }
}

/** Langkah awal saat membuka stasiun: lanjut dari langkah terakhir, atau langkah pertama. */
export function startIndex(station, state) {
  const index = station.steps.findIndex((step) => step.id === state?.last_step_id)
  return index >= 0 ? index : 0
}

/** Stasiun berikutnya yang terbuka & belum selesai setelah `currentId` (untuk tombol "Lanjut"). */
export function nextStation(stations, states, currentId) {
  const start = stations.findIndex((station) => station.id === currentId)
  return (
    stations
      .slice(start + 1)
      .find((station) => !states[station.id]?.locked && !states[station.id]?.completed) ?? null
  )
}

/** Petunjuk yang terlihat: `level` = jumlah petunjuk yang sudah dibuka. */
export function visibleHints(step, level) {
  return (step.hints ?? []).slice(0, level)
}

/** Teks polos untuk "Bacakan" (tanda format & rumus dibuang, isi dialog digabung). */
export function speakableText(step, user) {
  const parts = [step.title]
  if (step.kind === 'dialog') parts.push(...step.lines.map((line) => line.text))
  if (step.body) parts.push(step.body)
  if (step.text) parts.push(step.text)
  if (step.kind === 'worked_example')
    parts.push(...step.steps.map((s) => `${s.text}. ${s.explain}`))
  if (step.kind === 'choice') parts.push(...step.choices.map((c) => c.text))
  if (step.kind === 'flip_cards' || step.kind === 'flashcards') {
    parts.push(...step.cards.map((card) => `${card.front}. ${card.back}`))
  }
  return parts
    .filter(Boolean)
    .map((part) => personalize(part, user))
    .join('. ')
    .replace(/\$\$?[^$]*\$\$?/g, ' rumus ')
    .replace(/[*_`#|]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Rincian hasil -> bentuk `review` yang dipakai komponen soal interaktif Asesmen. */
export function reviewOf(result) {
  if (!result) return null
  return { result: result.detail, key: result.key ?? null }
}

// ---------------------------------------------------------------- antrean offline

/** Id unik per kiriman (server menolak kiriman ganda dengan id yang sama). */
export function newUid() {
  const random = Math.random().toString(36).slice(2, 10)
  return `${Date.now().toString(36)}-${random}`
}

export function queueAdd(queue, item) {
  return [...queue.filter((entry) => entry.uid !== item.uid), item]
}

export function queueRemove(queue, uid) {
  return queue.filter((entry) => entry.uid !== uid)
}

/** Error karena sinyal (tanpa respons server) -> layak dicoba lagi. Error 4xx tidak. */
export function isNetworkError(error) {
  return Boolean(error) && !error.response
}

// ---------------------------------------------------------------- tampilan

export const FONT_SCALES = [0.9, 1, 1.15, 1.3]

export function clampScale(index) {
  return Math.min(FONT_SCALES.length - 1, Math.max(0, Number.isInteger(index) ? index : 1))
}

/** Ringkasan untuk "Prestasiku". */
export function achievements(data) {
  const stations = flattenStations(data?.content)
  const states = data?.stations ?? {}
  const done = stations.filter((station) => states[station.id]?.completed)
  const perfect = done.filter((station) => states[station.id].stars === 3)
  const seconds = stations.reduce(
    (total, station) => total + (states[station.id]?.time_spent ?? 0),
    0,
  )
  return {
    stars: done.reduce((total, station) => total + states[station.id].stars, 0),
    maxStars: stations.length * 3,
    done: done.length,
    total: stations.length,
    perfect: perfect.length,
    minutes: Math.round(seconds / 60),
  }
}
