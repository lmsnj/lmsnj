// Soal interaktif (isian singkat, tarik & lepas, menjodohkan, video interaktif). Fungsi murni agar
// mudah diuji (npm test). Penilaian TIDAK dilakukan di sini — kunci jawaban tidak pernah dikirim ke
// browser siswa; di sini hanya bentuk jawaban, status "terjawab", dan pratinjau untuk guru.
//
// Bentuk jawaban (`response`) per jenis soal, sama dengan backend (apps/assessments/interactive.py):
// - fill_blank        : { gaps: ['teks', ...] }
// - drag_drop         : { gaps: [idPilihan | null, ...] }
// - matching          : { pairs: { idKiri: idKanan } }
// - interactive_video : { checkpoints: { idCheckpoint: jawabanSubSoal }, skipped: [idCheckpoint] }

import { getYoutubeId } from './media.js'

export const INTERACTIVE_KINDS = ['fill_blank', 'drag_drop', 'matching', 'interactive_video']
export const isInteractive = (kind) => INTERACTIVE_KINDS.includes(kind)

export const SCORING_MODES = [
  { value: 'partial', label: 'Sebagian (per celah/pasangan benar)' },
  { value: 'all_or_nothing', label: 'Semua benar atau 0' },
]

const GAP_RE = /\[\[([\s\S]*?)\]\]/g

/**
 * 'HTML singkatan dari [[HyperText|Hypertext]] Markup' ->
 * { parts: ['HTML singkatan dari ', ' Markup'], gaps: [['HyperText', 'Hypertext']] }
 */
export function parseGaps(template) {
  const parts = []
  const gaps = []
  let last = 0
  for (const match of String(template ?? '').matchAll(GAP_RE)) {
    parts.push(template.slice(last, match.index))
    gaps.push(
      match[1]
        .split('|')
        .map((alt) => alt.trim())
        .filter(Boolean),
    )
    last = match.index + match[0].length
  }
  parts.push(String(template ?? '').slice(last))
  return { parts, gaps }
}

// Pesan kesalahan kalimat [[...]] (sama dengan aturan backend), atau '' jika benar.
export function templateError(template, { single = false } = {}) {
  const { gaps } = parseGaps(template)
  if (!gaps.length) {
    return 'Tulis minimal satu jawaban di dalam [[...]], mis. Ibu kota Indonesia adalah [[Jakarta]].'
  }
  if (gaps.some((alternatives) => !alternatives.length)) {
    return 'Ada [[ ]] yang masih kosong. Tulis jawabannya di dalam kurung siku ganda.'
  }
  if (gaps.length > 20) return 'Maksimal 20 jawaban [[...]] dalam satu soal.'
  if (single && gaps.some((alternatives) => alternatives.length > 1)) {
    return 'Satu jawaban per celah (tanda | hanya untuk isian singkat).'
  }
  return ''
}

const filled = (text) => String(text ?? '').trim() !== ''

/** Soal dianggap terjawab hanya jika SEMUA celah/pasangan/checkpoint sudah diisi. */
export function isComplete(kind, content, response) {
  if (!content) return false
  const value = response ?? {}
  switch (kind) {
    case 'fill_blank': {
      const count = content.parts.length - 1
      return Array.from({ length: count }, (_, i) => value.gaps?.[i]).every(filled)
    }
    case 'drag_drop': {
      const count = content.parts.length - 1
      return Array.from({ length: count }, (_, i) => value.gaps?.[i]).every(Boolean)
    }
    case 'matching':
      return content.left.every((item) => Boolean(value.pairs?.[item.id]))
    case 'interactive_video':
      return content.checkpoints.every((cp) => isCheckpointDone(cp, value))
    default:
      return false
  }
}

// Isian singkat: ubah isi satu celah.
export function setGap(response, count, index, text) {
  const gaps = Array.from({ length: count }, (_, i) => response?.gaps?.[i] ?? '')
  gaps[index] = text
  return { ...response, gaps }
}

// Tarik & lepas: taruh pilihan di celah. Pilihan yang sudah ada di celah lain dipindahkan.
export function placeOption(response, count, gapIndex, optionId) {
  const gaps = Array.from({ length: count }, (_, i) => response?.gaps?.[i] ?? null).map((id) =>
    id === optionId ? null : id,
  )
  gaps[gapIndex] = optionId
  return { ...response, gaps }
}

// Tarik & lepas: kosongkan satu celah (atau celah tempat pilihan itu berada).
export function clearGap(response, count, gapIndex) {
  const gaps = Array.from({ length: count }, (_, i) => response?.gaps?.[i] ?? null)
  gaps[gapIndex] = null
  return { ...response, gaps }
}

// Menjodohkan: pasangkan kiri dengan kanan. Jawaban kanan yang sudah dipakai pasangan lain dilepas.
export function connectPair(response, leftId, rightId) {
  const pairs = Object.fromEntries(
    Object.entries(response?.pairs ?? {}).filter(([, right]) => right !== rightId),
  )
  pairs[leftId] = rightId
  return { ...response, pairs }
}

export function disconnectPair(response, leftId) {
  const pairs = { ...(response?.pairs ?? {}) }
  delete pairs[leftId]
  return { ...response, pairs }
}

// Warna pasangan (kiri & kanan memakai warna + nomor yang sama). Ditulis lengkap agar dikenali Tailwind.
export const PAIR_COLORS = [
  'bg-sky-100 ring-sky-500 text-sky-900',
  'bg-amber-100 ring-amber-500 text-amber-900',
  'bg-violet-100 ring-violet-500 text-violet-900',
  'bg-rose-100 ring-rose-500 text-rose-900',
  'bg-teal-100 ring-teal-500 text-teal-900',
  'bg-lime-100 ring-lime-600 text-lime-900',
  'bg-fuchsia-100 ring-fuchsia-500 text-fuchsia-900',
  'bg-orange-100 ring-orange-500 text-orange-900',
  'bg-indigo-100 ring-indigo-500 text-indigo-900',
  'bg-emerald-100 ring-emerald-600 text-emerald-900',
]

// ---------------------------------------------------------------- video interaktif

export const CHECKPOINT_KINDS = [
  { value: 'choice', label: 'Pilihan ganda' },
  { value: 'fill_blank', label: 'Isian singkat' },
  { value: 'drag_drop', label: 'Tarik & lepas' },
  { value: 'matching', label: 'Menjodohkan' },
]

// Detik -> "m:ss" (atau "j:mm:ss").
export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`
}

// "1:05" / "0:01:05" / "65" -> 65 detik; null jika tidak dikenali.
export function parseTime(text) {
  const value = String(text ?? '').trim()
  if (!/^\d+(:\d{1,2}){0,2}$/.test(value)) return null
  const parts = value.split(':').map(Number)
  if (parts.slice(1).some((part) => part >= 60)) return null
  return parts.reduce((total, part) => total * 60 + part, 0)
}

// Sub-soal checkpoint sudah dijawab lengkap?
export function isSubComplete(checkpoint, answer) {
  if (checkpoint.kind === 'choice') return Number.isInteger(answer?.choice)
  return isComplete(checkpoint.kind, checkpoint, answer)
}

// Checkpoint selesai = dijawab lengkap, atau dilewati (hanya untuk checkpoint opsional).
export function isCheckpointDone(checkpoint, response) {
  if (isSubComplete(checkpoint, response?.checkpoints?.[checkpoint.id])) return true
  return !checkpoint.required && Boolean(response?.skipped?.includes(checkpoint.id))
}

// Lompatan waktu lebih dari ini dianggap siswa menggeser video (bukan diputar biasa).
export const SEEK_JUMP = 1.5

/**
 * Dipanggil setiap beberapa ratus milidetik saat video diputar. Mengembalikan checkpoint yang harus
 * dibuka (video dihentikan) atau null.
 * - Diputar biasa melewati checkpoint yang belum selesai -> buka checkpoint itu.
 * - `allowSeek` false: ada checkpoint belum selesai di belakang posisi sekarang (siswa menggeser
 *   melewatinya) -> buka dengan `rewind: true` (video dikembalikan ke checkpoint itu).
 * - `allowSeek` true: menggeser melewati checkpoint dibolehkan (bisa dijawab dari daftar).
 */
export function checkpointGuard({ time, last, checkpoints, isDone, allowSeek }) {
  const pending = checkpoints.filter((cp) => !isDone(cp))
  if (!allowSeek) {
    const missed = pending.find((cp) => cp.time <= time)
    if (missed) return { checkpoint: missed, rewind: time - missed.time > SEEK_JUMP }
    return null
  }
  const playedNormally = time >= last && time - last <= SEEK_JUMP
  if (!playedNormally) return null
  const crossed = pending.find((cp) => cp.time > last && cp.time <= time)
  return crossed ? { checkpoint: crossed, rewind: false } : null
}

// Satu checkpoint kosong untuk form guru.
export function emptyCheckpoint(kind = 'choice', time = 0) {
  const base = { time, kind, text: '', points: 1, required: true, explanation: '' }
  if (kind === 'choice') return { ...base, choices: ['', ''], correct_choice: null }
  return { ...base, ...emptySpec(kind) }
}

// Acak urutan dengan seed teks (hasil selalu sama untuk seed yang sama), untuk pratinjau guru.
export function seededShuffle(items, seed) {
  let h = 2166136261
  for (const char of String(seed)) h = Math.imul(h ^ char.charCodeAt(0), 16777619)
  const random = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// Rancangan kosong untuk soal baru.
export function emptySpec(kind) {
  switch (kind) {
    case 'fill_blank':
      return { template: '', case_sensitive: false }
    case 'drag_drop':
      return { template: '', distractors: [] }
    case 'matching':
      return {
        pairs: [
          { left: '', right: '' },
          { left: '', right: '' },
        ],
        distractors: [],
      }
    case 'interactive_video':
      return {
        source: 'youtube',
        url: '',
        duration: null,
        allow_seek: false,
        mode: 'exam',
        checkpoints: [],
      }
    default:
      return {}
  }
}

/** Periksa rancangan guru sebelum disimpan (backend memeriksa ulang). '' = tidak ada masalah. */
export function specError(kind, spec, { hasImage, hasVideo } = {}) {
  switch (kind) {
    case 'fill_blank':
      return templateError(spec.template)
    case 'drag_drop': {
      const error = templateError(spec.template, { single: true })
      if (error) return error
      const gapCount = parseGaps(spec.template).gaps.length
      const empty = (spec.distractors ?? []).findIndex(
        (text, j) => !filled(text) && !hasImage?.(`choice-${gapCount + j}`),
      )
      return empty >= 0
        ? `Pengecoh nomor ${empty + 1} masih kosong. Isi teksnya atau beri gambar.`
        : ''
    }
    case 'matching':
      return matchingError(spec)
    case 'interactive_video':
      return videoError(spec, { hasVideo })
    default:
      return ''
  }
}

const same = (text) =>
  String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()

function matchingError(spec) {
  const pairs = spec.pairs ?? []
  if (pairs.length < 2 || pairs.length > 10) return 'Isi 2 sampai 10 pasangan.'
  const incomplete = pairs.findIndex((pair) => !filled(pair.left) || !filled(pair.right))
  if (incomplete >= 0) return `Pasangan nomor ${incomplete + 1} belum lengkap (isi kiri dan kanan).`
  const distractors = spec.distractors ?? []
  const empty = distractors.findIndex((text) => !filled(text))
  if (empty >= 0) return `Pengecoh nomor ${empty + 1} masih kosong.`
  if (new Set(pairs.map((p) => same(p.left))).size !== pairs.length) {
    return 'Pernyataan di kiri tidak boleh ada yang sama.'
  }
  const rights = [...pairs.map((p) => p.right), ...distractors]
  if (new Set(rights.map(same)).size !== rights.length) {
    return 'Jawaban di kanan (termasuk pengecoh) tidak boleh ada yang sama.'
  }
  return ''
}

function checkpointError(cp) {
  if (!Number.isInteger(cp.time) || cp.time < 0) return 'isi waktu dengan format menit:detik.'
  if (!Number.isInteger(Number(cp.points)) || cp.points < 1 || cp.points > 100) {
    return 'poin harus 1-100.'
  }
  if (!filled(cp.text) && ['choice', 'matching'].includes(cp.kind)) return 'tulis pertanyaannya.'
  if (cp.kind === 'choice') {
    const choices = cp.choices ?? []
    if (choices.length < 2 || choices.some((choice) => !filled(choice))) {
      return 'isi minimal 2 pilihan (tidak boleh kosong).'
    }
    return Number.isInteger(cp.correct_choice) && cp.correct_choice < choices.length
      ? ''
      : 'tandai satu pilihan sebagai jawaban benar.'
  }
  return specError(cp.kind, cp, { hasImage: () => false })
}

function videoError(spec, { hasVideo } = {}) {
  if (spec.source === 'youtube' && !getYoutubeId(spec.url)) {
    return 'Link YouTube tidak dikenali. Contoh: https://www.youtube.com/watch?v=..., https://youtu.be/..., atau https://www.youtube.com/shorts/...'
  }
  if (spec.source === 'file' && !hasVideo) return 'Pilih file video (MP4/WEBM) untuk diunggah.'
  const checkpoints = spec.checkpoints ?? []
  if (!checkpoints.length) return 'Tambahkan minimal satu checkpoint.'
  for (const [index, cp] of checkpoints.entries()) {
    if (spec.duration && cp.time > spec.duration) {
      return `Checkpoint nomor ${index + 1}: waktu ${formatTime(cp.time)} melebihi durasi video (${formatTime(spec.duration)}).`
    }
    const error = checkpointError(cp)
    if (error) return `Checkpoint nomor ${index + 1}: ${error[0].toLowerCase()}${error.slice(1)}`
  }
  if (new Set(checkpoints.map((cp) => cp.time)).size !== checkpoints.length) {
    return 'Dua checkpoint tidak boleh berada di detik yang sama.'
  }
  const total = checkpoints.reduce((sum, cp) => sum + Number(cp.points || 0), 0)
  return total > 100 ? 'Jumlah poin semua checkpoint maksimal 100.' : ''
}

/**
 * Isi soal versi siswa dari rancangan guru, untuk pratinjau di form (tanpa menyimpan).
 * `current` = gambar tersimpan per kunci ('choice-N'), `pending` = File baru / 'remove'.
 */
export function previewContent(kind, spec, { current = {}, pending = {}, videoUrl = null } = {}) {
  if (kind === 'interactive_video') return previewVideo(spec, videoUrl)
  const { parts, gaps } = parseGaps(spec.template)
  if (kind === 'fill_blank') {
    if (!gaps.length) return null
    return { parts, case_sensitive: Boolean(spec.case_sensitive) }
  }
  if (kind === 'drag_drop') {
    if (!gaps.length) return null
    const texts = [
      ...gaps.map((alternatives) => alternatives[0] ?? ''),
      ...(spec.distractors ?? []),
    ]
    const options = texts.map((text, index) => {
      const key = `choice-${index}`
      const file = pending[key]
      const image =
        file instanceof File
          ? { name: file.name }
          : file === 'remove'
            ? null
            : (current[key] ?? null)
      return { id: `pilihan-${index}`, text, image }
    })
    return { parts, options: seededShuffle(options, spec.template) }
  }
  if (kind === 'matching') {
    const pairs = (spec.pairs ?? []).filter((pair) => filled(pair.left) || filled(pair.right))
    if (!pairs.length) return null
    const left = pairs.map((pair, i) => ({ id: `kiri-${i}`, text: pair.left }))
    const right = [...pairs.map((pair) => pair.right), ...(spec.distractors ?? [])].map(
      (text, i) => ({ id: `kanan-${i}`, text }),
    )
    const seed = JSON.stringify(spec)
    return { left: seededShuffle(left, `${seed}kiri`), right: seededShuffle(right, `${seed}kanan`) }
  }
  return null
}

// Warna kotak jawaban sesuai hasil: hijau benar, merah salah, netral jika belum dinilai.
export const resultTone = (correct) =>
  correct === true
    ? 'bg-brand-50 text-brand-900 ring-brand-600'
    : correct === false
      ? 'bg-red-50 text-red-800 ring-red-400'
      : 'bg-white ring-slate-400'

function previewVideo(spec, videoUrl) {
  const checkpoints = [...(spec.checkpoints ?? [])]
    .map((cp, index) => {
      const common = {
        id: `checkpoint-${index}`,
        time: cp.time,
        kind: cp.kind,
        text: cp.text,
        points: Number(cp.points) || 0,
        required: cp.required !== false,
      }
      const sub = cp.kind === 'choice' ? { choices: cp.choices ?? [] } : previewContent(cp.kind, cp)
      return sub ? { ...common, ...sub } : null
    })
    .filter((cp) => cp && Number.isInteger(cp.time))
    .sort((a, b) => a.time - b.time)
  const media =
    spec.source === 'youtube'
      ? { source: 'youtube', youtube_id: getYoutubeId(spec.url) }
      : { source: 'file', video_url: videoUrl }
  if (!media.youtube_id && !media.video_url) return null
  return {
    ...media,
    duration: spec.duration,
    allow_seek: Boolean(spec.allow_seek),
    mode: spec.mode,
    checkpoints,
    total_points: checkpoints.reduce((sum, cp) => sum + cp.points, 0),
  }
}
