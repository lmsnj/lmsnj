import { Printer, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { qrCardsApi } from '../../api/qrQuiz'
import useFetch from '../../hooks/useFetch'
import { getErrorMessage } from '../../utils/errors'
import Alert from '../Alert'
import Button from '../Button'
import Modal from '../Modal'
import Spinner from '../Spinner'
import { inputClass } from '../TextField'

function CardTable({ data, readOnly, onSaved }) {
  const [numbers, setNumbers] = useState(() =>
    Object.fromEntries(data.rows.map((row) => [row.student, row.number ?? ''])),
  )
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const run = async (action, done) => {
    setBusy(true)
    setErrors({})
    setMessage(null)
    try {
      const result = await action()
      setNumbers(Object.fromEntries(result.rows.map((row) => [row.student, row.number ?? ''])))
      setMessage({ type: 'success', text: done })
      onSaved?.()
    } catch (error) {
      setErrors(error?.response?.data?.records ?? {})
      setMessage({ type: 'error', text: getErrorMessage(error) })
    } finally {
      setBusy(false)
    }
  }
  const save = () =>
    run(
      () =>
        qrCardsApi.save(
          data.classroom,
          data.rows.map((row) => ({
            student: row.student,
            number: numbers[row.student] === '' ? null : Number(numbers[row.student]),
          })),
        ),
      'Peta kartu disimpan.',
    )
  const auto = () => run(() => qrCardsApi.auto(data.classroom), 'Kartu diisi sesuai urutan nama.')

  if (data.rows.length === 0) {
    return <Alert type="info">Belum ada siswa aktif di kelas ini.</Alert>
  }
  return (
    <div className="space-y-3">
      <Alert type={message?.type}>{message?.text}</Alert>
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={auto} disabled={busy}>
            <Wand2 className="size-4" aria-hidden="true" /> Isi otomatis (urutan nama)
          </Button>
          <Link
            to={`/cetak/kartu-qr?sampai=${data.card_limit}`}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            <Printer className="size-4" aria-hidden="true" /> Cetak set kartu
          </Link>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">No</th>
              <th className="px-3 py-2">Nama</th>
              <th className="w-32 px-3 py-2">Nomor kartu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map((row, index) => (
              <tr key={row.student}>
                <td className="px-3 py-1.5 text-slate-500">{index + 1}</td>
                <td className="px-3 py-1.5">
                  <p className="font-medium text-slate-800">{row.full_name}</p>
                  {errors[row.student] && (
                    <p className="text-xs text-red-600">{errors[row.student]}</p>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    min={1}
                    max={data.card_limit}
                    value={numbers[row.student]}
                    disabled={readOnly}
                    aria-label={`Nomor kartu ${row.full_name}`}
                    onChange={(event) =>
                      setNumbers({ ...numbers, [row.student]: event.target.value })
                    }
                    className={`${inputClass} ${errors[row.student] ? 'ring-red-400' : 'ring-slate-300'}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={save} loading={busy}>
            Simpan Peta Kartu
          </Button>
        </div>
      )}
    </div>
  )
}

/** Peta kartu kelas: nomor kartu QR yang dipegang tiap siswa (kosong = tanpa kartu). */
export default function CardMapModal({ classroomId, readOnly, onClose, onSaved }) {
  const cards = useFetch(qrCardsApi.get, classroomId)
  return (
    <Modal
      open
      size="lg"
      title={`Peta Kartu ${cards.data?.classroom_name ?? ''}`}
      onClose={onClose}
    >
      {cards.error && <Alert type="error">{cards.error}</Alert>}
      {!cards.data && !cards.error && (
        <div className="py-8 text-center text-brand-600">
          <Spinner />
        </div>
      )}
      {cards.data && <CardTable data={cards.data} readOnly={readOnly} onSaved={onSaved} />}
    </Modal>
  )
}
