import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { materialsApi } from '../../api/materials'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import SelectField from '../../components/SelectField'
import Spinner from '../../components/Spinner'
import useFetch from '../../hooks/useFetch'
import { getErrorMessage } from '../../utils/errors'

const COUNTS = [5, 8, 10, 15, 20].map((n) => ({ value: String(n), label: `${n} soal` }))

/**
 * Buat asesmen "Cek Pemahaman" otomatis untuk satu materi. Sumber utama (gratis) = konsep kunci
 * "istilah = penjelasan" di materi; AI (Claude API) hanya muncul jika diaktifkan di server.
 * Hasilnya draf yang langsung menjadi syarat materi; guru memeriksa lalu menerbitkannya.
 */
export default function GenerateAssessmentModal({ material, onClose, onCreated }) {
  const status = useFetch(materialsApi.autoAssessmentStatus, material.id)
  const [source, setSource] = useState('concepts')
  const [count, setCount] = useState('10')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const info = status.data
  const enoughConcepts = info && info.concepts >= info.min_concepts
  const canUseAi = info?.ai_enabled && info.objectives > 0
  const ready = source === 'ai' ? canUseAi : enoughConcepts

  const generate = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await materialsApi.generateAssessment(material.id, {
        source,
        question_count: Number(count),
      })
      setResult(data)
      onCreated()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  let body
  if (status.loading && !info) {
    body = (
      <div className="py-6 text-center text-brand-600">
        <Spinner />
      </div>
    )
  } else if (result) {
    body = (
      <Alert type="success">
        Asesmen &ldquo;{result.title}&rdquo; dibuat dengan {result.question_count} soal
        {result.skipped > 0 &&
          ` (${result.skipped} soal dibuang karena tidak lolos pemeriksaan)`}{' '}
        dan sudah menjadi syarat materi ini. Statusnya masih <strong>draf</strong>: periksa soalnya,
        lalu terbitkan agar siswa bisa mengerjakan.
      </Alert>
    )
  } else {
    body = (
      <>
        <Alert type="error">{status.error || error}</Alert>
        {canUseAi && (
          <SelectField
            label="Sumber soal"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            options={[
              { value: 'concepts', label: 'Konsep kunci (gratis)' },
              { value: 'ai', label: 'AI dari capaian materi (berbayar)' },
            ]}
            disabled={busy}
          />
        )}
        {source === 'concepts' ? (
          <>
            <p>
              Soal dibuat dari <strong>konsep kunci</strong> materi &ldquo;{material.title}&rdquo;:
              jodohkan, pilihan ganda (dua arah), isian, dan benar/salah. Kunci jawabannya pasti
              benar karena diambil dari pasangan yang Anda tulis.
            </p>
            {enoughConcepts ? (
              <Alert type="info">
                {info.concepts} konsep siap dipakai (sekitar {info.concepts + 4} soal).
              </Alert>
            ) : (
              <Alert type="info">
                Materi ini baru punya {info?.concepts ?? 0} konsep kunci; minimal{' '}
                {info?.min_concepts ?? 4}. Klik <strong>Ubah</strong> pada materi, lalu isi kolom
                &ldquo;Konsep kunci&rdquo; satu per baris, mis.{' '}
                <em>Algoritma = Urutan langkah logis untuk menyelesaikan masalah</em>.
              </Alert>
            )}
          </>
        ) : (
          <>
            <p>AI menyusun soal yang menguji setiap capaian materi:</p>
            <ul className="list-disc space-y-1 pl-5">
              {material.objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
            <SelectField
              label="Jumlah soal"
              value={count}
              onChange={(event) => setCount(event.target.value)}
              options={COUNTS}
              disabled={busy}
            />
          </>
        )}
        <p className="text-slate-600">
          Semua soal dinilai otomatis. KKM 75 dengan 2 kali remedial; siswa baru bisa lanjut ke
          materi berikutnya setelah tuntas.
        </p>
        {material.required_assessment && (
          <Alert type="info">
            Materi ini sudah punya syarat asesmen &ldquo;{material.required_assessment_title}
            &rdquo;. Asesmen baru akan menggantikannya sebagai syarat (asesmen lama tidak dihapus).
          </Alert>
        )}
      </>
    )
  }

  return (
    <Modal
      open
      title="Buat Asesmen Otomatis"
      onClose={busy ? () => {} : onClose}
      footer={
        result ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Tutup
            </Button>
            <Link
              to={`/guru/asesmen/${result.assessment}`}
              className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Periksa & Terbitkan
            </Link>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Batal
            </Button>
            <Button onClick={generate} loading={busy} disabled={!ready}>
              <Sparkles className="size-4" aria-hidden="true" /> Buat Soal
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4 text-sm text-slate-700">{body}</div>
    </Modal>
  )
}
