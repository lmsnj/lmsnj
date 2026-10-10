import { formatScore } from './tasks.js'

/** Nilai skala 100 dengan koma desimal: 87.5 -> "87,5". */
export const formatPercent = (value) =>
  value === null || value === undefined ? '-' : formatScore(value)

/**
 * Tampilan hasil akhir (result dari API, lihat backend assessments/results.py):
 * { label, color, title, message } atau null jika belum ada yang dikumpulkan.
 */
export function resultDisplay(result) {
  if (!result || result.status === 'none') return null
  const kkm = result.passing_score
  switch (result.status) {
    case 'pending':
      return {
        label: 'Menunggu penilaian guru',
        color: 'amber',
        title: 'Jawaban terkumpul',
        message: 'Nilai akhir muncul setelah guru menilai jawaban esai Anda.',
      }
    case 'passed':
      return {
        label: result.passed_by_remedial ? 'Tuntas (remedial)' : 'Tuntas',
        color: 'green',
        title: 'Selamat, Anda tuntas!',
        message: result.passed_by_remedial
          ? `Nilai remedial Anda ${formatPercent(result.best_score)}, dicatat sesuai KKM (${kkm}).`
          : `Nilai Anda sudah mencapai KKM ${kkm}.`,
      }
    case 'remedial':
      return {
        label: 'Remedial',
        color: 'amber',
        title: 'Belum tuntas, Anda bisa remedial',
        message: `Nilai Anda di bawah KKM ${kkm}. Sisa kesempatan remedial: ${result.remedial_left} kali.`,
      }
    case 'failed':
      return {
        label: 'Belum tuntas',
        color: 'red',
        title: 'Belum tuntas',
        message:
          result.remedial_used > 0
            ? `Nilai Anda masih di bawah KKM ${kkm} dan kesempatan remedial sudah habis. Hubungi guru mapel.`
            : `Nilai Anda di bawah KKM ${kkm}. Hubungi guru mapel untuk tindak lanjut.`,
      }
    default:
      return { label: 'Sudah dinilai', color: 'green', title: 'Nilai Anda', message: '' }
  }
}

// Status lembar asesmen dari sudut pandang siswa (my_attempt & my_result dari API).
export function studentAssessmentStatus(assessment) {
  const attempt = assessment.my_attempt
  if (!attempt) {
    return assessment.is_past_due
      ? { label: 'Tidak dikerjakan', color: 'red' }
      : { label: 'Belum dikerjakan', color: 'blue' }
  }
  if (attempt.status === 'in_progress') {
    return { label: attempt.number > 1 ? 'Sedang remedial' : 'Sedang dikerjakan', color: 'amber' }
  }
  const result = assessment.my_result
  if (attempt.status === 'submitted' || result?.status === 'pending') {
    return { label: 'Menunggu penilaian esai', color: 'amber' }
  }
  if (result && ['passed', 'remedial', 'failed'].includes(result.status)) {
    const shown = resultDisplay(result)
    return { label: `${shown.label} · ${formatPercent(result.final_score)}`, color: shown.color }
  }
  return { label: `Nilai ${formatScore(attempt.score)}/${assessment.max_score}`, color: 'green' }
}

// Status satu siswa di tabel hasil guru.
export function attemptStatus(attempt) {
  if (!attempt) return { label: 'Belum mengerjakan', color: 'gray' }
  if (attempt.status === 'in_progress') return { label: 'Sedang mengerjakan', color: 'blue' }
  if (attempt.status === 'submitted') return { label: 'Perlu dinilai', color: 'amber' }
  return { label: 'Selesai dinilai', color: 'green' }
}

export const QUESTION_KINDS = {
  choice: 'Pilihan ganda',
  multiple: 'PG kompleks',
  category: 'Kategori (Benar/Salah)',
  essay: 'Esai',
  fill_blank: 'Isian singkat',
  drag_drop: 'Tarik & lepas',
  matching: 'Menjodohkan',
  interactive_video: 'Video interaktif',
}

export const KIND_COLORS = {
  choice: 'blue',
  multiple: 'green',
  category: 'amber',
  essay: 'gray',
  fill_blank: 'blue',
  drag_drop: 'green',
  matching: 'amber',
  interactive_video: 'red',
}

// Huruf pilihan: 0 -> A, 1 -> B, dst.
export const choiceLetter = (index) => String.fromCharCode(65 + index)

// Sisa waktu "mm:ss" (atau "j:mm:ss" jika lebih dari satu jam).
export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

// Arah teks soal: 'auto' | 'rtl' | 'ltr' (diatur guru per soal).
export const questionDir = (question) => question.text_direction || 'auto'
