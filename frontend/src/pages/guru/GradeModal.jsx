import { useId, useState } from 'react'
import { gradesApi } from '../../api/tasks'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import SubmissionView from '../../components/SubmissionView'
import TextAreaField from '../../components/TextAreaField'
import TextField from '../../components/TextField'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import { formatScore, parseScore } from '../../utils/tasks'

/**
 * Lihat jawaban satu siswa dan beri nilai.
 * `nextRow` = siswa berikutnya yang sudah mengumpulkan tetapi belum dinilai (untuk "Simpan & Berikutnya").
 * Komponen dipasang ulang (lewat `key`) untuk setiap siswa, jadi isian selalu segar.
 */
export default function GradeModal({ row, maxScore, nextRow, onClose, onSaved }) {
  const submission = row.submission
  const formId = useId()
  const [score, setScore] = useState(
    submission.score === null ? '' : String(submission.score).replace('.', ','),
  )
  const [feedback, setFeedback] = useState(submission.feedback ?? '')
  const [errors, setErrors] = useState({})
  const [generalError, setGeneralError] = useState('')
  const [saving, setSaving] = useState(null) // 'save' | 'next' | 'remove'

  const save = async (mode) => {
    const value = mode === 'remove' ? null : parseScore(score)
    if (mode !== 'remove') {
      if (value === null) return setErrors({ score: 'Nilai wajib diisi.' })
      if (Number.isNaN(value) || value > maxScore) {
        return setErrors({ score: `Isi angka 0 sampai ${maxScore}, contoh: 85 atau 87,5.` })
      }
    }
    setSaving(mode)
    setErrors({})
    setGeneralError('')
    try {
      const saved = await gradesApi.grade(submission.id, {
        score: value,
        feedback: mode === 'remove' ? '' : feedback,
      })
      onSaved(saved, mode === 'next')
    } catch (err) {
      const fieldErrors = getFieldErrors(err)
      setErrors(fieldErrors)
      if (!Object.keys(fieldErrors).length) setGeneralError(getErrorMessage(err))
    } finally {
      setSaving(null)
    }
  }

  return (
    <Modal
      open
      title={`Jawaban ${row.student.full_name}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {submission.score !== null && (
            <Button
              variant="ghost"
              className="mr-auto text-red-600"
              loading={saving === 'remove'}
              onClick={() => save('remove')}
            >
              Hapus Nilai
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          <Button
            type="submit"
            form={formId}
            variant={nextRow ? 'secondary' : 'primary'}
            loading={saving === 'save'}
          >
            Simpan
          </Button>
          {nextRow && (
            <Button loading={saving === 'next'} onClick={() => save('next')}>
              Simpan & Berikutnya
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
        <SubmissionView submission={submission} />
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault()
            save('save')
          }}
          className="space-y-4"
        >
          <Alert type="error">{generalError}</Alert>
          <TextField
            label={`Nilai (0–${maxScore})`}
            value={score}
            onChange={(event) => setScore(event.target.value)}
            error={errors.score}
            inputMode="decimal"
            placeholder="contoh: 85"
            autoFocus
          />
          <TextAreaField
            label="Umpan balik untuk siswa (opsional)"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            error={errors.feedback}
            rows={5}
          />
          {submission.score !== null && (
            <p className="text-xs text-slate-500">
              Nilai saat ini {formatScore(submission.score)}, oleh {submission.graded_by_name}.
              Jawaban yang sudah dinilai tidak bisa diubah siswa.
            </p>
          )}
          {nextRow && (
            <p className="text-xs text-slate-500">Berikutnya: {nextRow.student.full_name}</p>
          )}
        </form>
      </div>
    </Modal>
  )
}
