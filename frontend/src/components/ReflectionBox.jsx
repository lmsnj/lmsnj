import { CircleCheck } from 'lucide-react'
import { useState } from 'react'
import { materialsApi } from '../api/materials'
import useFormSubmit from '../hooks/useFormSubmit'
import { formatDate } from '../utils/media'
import Alert from './Alert'
import Button from './Button'
import TextAreaField from './TextAreaField'

// Harus sama dengan MIN_REFLECTION / MAX_REFLECTION di backend (apps/materials/serializers.py).
export const MIN_REFLECTION = 20
const MAX_REFLECTION = 2000

/**
 * Kotak "Cerita Reflektif" siswa untuk satu materi. Refleksi boleh diubah kapan saja;
 * `onSaved(materiTerbaru)` dipanggil setelah tersimpan.
 */
export default function ReflectionBox({ material, onSaved }) {
  const saved = material.progress?.reflection ?? ''
  const [text, setText] = useState(saved)
  const [notice, setNotice] = useState('')
  const changed = text.trim() !== saved
  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const updated = await materialsApi.saveReflection(material.id, text)
    setNotice('Cerita reflektif disimpan.')
    onSaved?.(updated)
  })

  return (
    <form onSubmit={submit} className="space-y-2">
      <TextAreaField
        label="Cerita reflektif"
        rows={4}
        value={text}
        maxLength={MAX_REFLECTION}
        placeholder="Tulis refleksi Anda di sini... Apa yang Anda pelajari? Bagian mana yang masih sulit? Apa yang akan Anda coba berikutnya?"
        onChange={(e) => {
          setText(e.target.value)
          setNotice('')
        }}
        error={errors.reflection}
        hint={`Minimal ${MIN_REFLECTION} karakter (${text.trim().length}/${MAX_REFLECTION}).`}
      />
      <Alert type="error">{generalError}</Alert>
      <Alert type="success">{notice}</Alert>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" loading={submitting} disabled={!changed}>
          {saved ? 'Simpan Perubahan' : 'Kirim Refleksi'}
        </Button>
        {saved && material.progress?.reflected_at && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <CircleCheck className="size-3.5 text-brand-600" aria-hidden="true" />
            Terakhir disimpan {formatDate(material.progress.reflected_at)}
          </span>
        )}
      </div>
    </form>
  )
}
