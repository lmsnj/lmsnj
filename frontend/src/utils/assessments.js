import { formatScore } from './tasks'

// Status lembar asesmen dari sudut pandang siswa (my_attempt dari API).
export function studentAssessmentStatus(assessment) {
  const attempt = assessment.my_attempt
  if (!attempt) {
    return assessment.is_past_due
      ? { label: 'Tidak dikerjakan', color: 'red' }
      : { label: 'Belum dikerjakan', color: 'blue' }
  }
  if (attempt.status === 'in_progress') return { label: 'Sedang dikerjakan', color: 'amber' }
  if (attempt.status === 'submitted') return { label: 'Menunggu penilaian esai', color: 'amber' }
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
}

export const KIND_COLORS = { choice: 'blue', multiple: 'green', category: 'amber', essay: 'gray' }

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
