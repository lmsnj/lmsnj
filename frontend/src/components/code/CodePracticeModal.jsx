import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { codeExercisesApi } from '../../api/materials'
import useFetch from '../../hooks/useFetch'
import { LANGUAGE_LABELS } from '../../utils/codePractice'
import Alert from '../Alert'
import Button from '../Button'
import Modal from '../Modal'
import Spinner from '../Spinner'
import CodeWorkspace from './CodeWorkspace'
import MathWorkspace from './MathWorkspace'

/**
 * Praktik satu materi (kode atau Matematika): tab per soal (tanda centang jika lulus) + area kerja. Siswa: pekerjaan
 * disimpan, `onChange(materi)` dipanggil agar syarat "Lulus Praktik" langsung terlihat.
 * Guru (`preview`): mencoba soal tanpa menyimpan.
 */
export default function CodePracticeModal({ material, preview = false, onClose, onChange }) {
  const exercises = useFetch(codeExercisesApi.list, material.id)
  const [active, setActive] = useState(0)
  // Status lulus per soal yang diperbarui setelah siswa memeriksa (tanpa memuat ulang daftar).
  const [passedIds, setPassedIds] = useState([])
  // Draf kode per soal agar tidak hilang saat pindah tab.
  const [drafts, setDrafts] = useState({})

  const list = exercises.data ?? []
  const current = list[active]
  const isPassed = (exercise) => passedIds.includes(exercise.id) || exercise.my_attempt?.passed
  const Workspace = current?.language === 'math' ? MathWorkspace : CodeWorkspace

  return (
    <Modal
      open
      size="xl"
      title={`Praktik: ${material.title}`}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Tutup
        </Button>
      }
    >
      <Alert type="error">{exercises.error}</Alert>
      {exercises.loading && !list.length ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : !list.length ? (
        <p className="py-6 text-center text-sm text-slate-500">
          Materi ini belum punya soal praktik.
        </p>
      ) : (
        <div className="space-y-4">
          {list.length > 1 && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Soal praktik">
              {list.map((exercise, index) => (
                <button
                  key={exercise.id}
                  type="button"
                  role="tab"
                  aria-selected={index === active}
                  onClick={() => setActive(index)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ${
                    index === active
                      ? 'bg-brand-600 text-white ring-brand-600'
                      : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {isPassed(exercise) && <CheckCircle2 className="size-4" aria-label="Lulus" />}
                  Soal {index + 1}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500">
            {current.language === 'math' ? (
              <>
                Matematika • Isi semua jawaban lalu klik <strong>Periksa</strong>. Semua jawaban
                harus benar; boleh mencoba lagi.
              </>
            ) : (
              <>
                {LANGUAGE_LABELS[current.language]} • Tulis kode, klik <strong>Jalankan</strong>{' '}
                untuk mencoba, lalu <strong>Periksa</strong>. Semua pemeriksaan harus lulus.
              </>
            )}
          </p>
          <Workspace
            key={current.id}
            exercise={current}
            preview={preview}
            initialCode={drafts[current.id]}
            initialPassed={isPassed(current)}
            onCodeChange={(value) => setDrafts((all) => ({ ...all, [current.id]: value }))}
            onSaved={({ attempt, material: updated }) => {
              if (attempt.passed) {
                setPassedIds((ids) => (ids.includes(current.id) ? ids : [...ids, current.id]))
              }
              onChange?.(updated)
            }}
          />
        </div>
      )}
    </Modal>
  )
}
