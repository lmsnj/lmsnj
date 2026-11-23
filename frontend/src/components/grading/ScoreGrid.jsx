import { Check, CloudOff, Loader2, MessageSquareText, UserX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { gradeActivitiesApi } from '../../api/grading'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import {
  checkValue,
  fillEmpty,
  gridSummary,
  isBelowKkm,
  predicateScores,
  SCALE_LABELS,
} from '../../utils/grading'
import Button from '../Button'
import { inputClass } from '../TextField'

const SAVE_DELAY_MS = 600

function SaveStatus({ state, onRetry }) {
  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-slate-500" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Menyimpan…
      </span>
    )
  }
  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-brand-700" role="status">
        <Check className="size-4" aria-hidden="true" /> Tersimpan
      </span>
    )
  }
  if (state === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1 text-sm font-semibold text-red-600 underline"
      >
        <CloudOff className="size-4" aria-hidden="true" /> Gagal menyimpan — coba lagi
      </button>
    )
  }
  return null
}

/**
 * Grid nilai satu kegiatan penilaian langsung. Dirancang untuk HP guru: satu kolom, angka besar,
 * Enter pindah ke siswa berikutnya, dan setiap perubahan tersimpan otomatis (ditunda sebentar agar
 * beberapa ketikan cepat terkirim sekali).
 */
export default function ScoreGrid({ activity, kkm, initialRows, readOnly, onSaved }) {
  const [rows, setRows] = useState(initialRows)
  const [errors, setErrors] = useState({})
  const [saveState, setSaveState] = useState('idle')
  const [saveError, setSaveError] = useState('')
  const [fillValue, setFillValue] = useState('')
  const [openNote, setOpenNote] = useState(null)
  const pending = useRef(new Map())
  const timer = useRef(null)
  const inputs = useRef([])
  const { scale, bands } = activity
  const predicates = scale === 'predikat' ? Object.keys(predicateScores(bands)) : []

  const flush = async () => {
    clearTimeout(timer.current)
    if (pending.current.size === 0) return
    const records = [...pending.current.values()]
    pending.current = new Map()
    setSaveState('saving')
    try {
      const data = await gradeActivitiesApi.saveScores(activity.id, records)
      // Pakai nilai skala 100 dari server, kecuali baris yang sudah diubah lagi sejak dikirim.
      const fresh = Object.fromEntries(data.rows.map((row) => [row.student, row]))
      setRows((current) =>
        current.map((row) =>
          pending.current.has(row.student) || !fresh[row.student]
            ? row
            : { ...row, score: fresh[row.student].score },
        ),
      )
      setSaveState(pending.current.size ? 'saving' : 'saved')
      setSaveError('')
      onSaved?.(data.activity)
    } catch (err) {
      // Kirim ulang nanti: kembalikan ke antrean (yang lebih baru tetap menang).
      for (const record of records) {
        if (!pending.current.has(record.student)) pending.current.set(record.student, record)
      }
      const fieldErrors = getFieldErrors(err)
      const perStudent = err?.response?.data?.records
      if (perStudent && typeof perStudent === 'object') setErrors((e) => ({ ...e, ...perStudent }))
      setSaveError(fieldErrors.records && !perStudent ? fieldErrors.records : getErrorMessage(err))
      setSaveState('error')
    }
  }
  // Fungsi flush terbaru untuk timer & saat halaman ditinggalkan.
  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  })
  useEffect(() => () => flushRef.current(), [])

  const update = (student, patch) => {
    const row = { ...rows.find((r) => r.student === student), ...patch }
    const check =
      row.status === 'tidak_hadir' ? { score: null } : checkValue(scale, row.value, bands)
    // Isian salah tetap terlihat (agar bisa diperbaiki) tetapi tidak dikirim ke server.
    setRows((current) =>
      current.map((r) => (r.student === student ? { ...row, score: check.score ?? null } : r)),
    )
    if (check.error) {
      setErrors((e) => ({ ...e, [student]: check.error }))
      pending.current.delete(student)
      return
    }
    setErrors(({ [student]: _removed, ...rest }) => rest)
    pending.current.set(student, {
      student,
      value: row.status === 'tidak_hadir' ? '' : row.value,
      status: row.status,
      note: row.note,
    })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY_MS)
  }

  const fillAll = () => {
    const check = checkValue(scale, fillValue, bands)
    if (check.error || check.score === null) {
      setSaveError(check.error ?? 'Isi nilai yang akan dipakai.')
      return
    }
    for (const student of fillEmpty(rows)) update(student, { value: fillValue.trim() })
    setFillValue('')
  }

  const summary = gridSummary(rows, kkm)
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <p>
          Skala <strong>{SCALE_LABELS[scale] ?? scale}</strong> · KKM <strong>{kkm}</strong> ·{' '}
          {summary.graded} dinilai · {summary.absent} tidak hadir · {summary.empty} belum
          {summary.below > 0 && (
            <span className="font-semibold text-red-600"> · {summary.below} di bawah KKM</span>
          )}
        </p>
        <SaveStatus state={saveState} onRetry={() => flushRef.current()} />
      </div>
      {saveError && saveState === 'error' && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {saveError}
        </p>
      )}
      {!readOnly && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <span className="text-sm font-medium text-slate-700">Isi yang kosong dengan</span>
          {scale === 'predikat' ? (
            <select
              aria-label="Nilai untuk semua yang kosong"
              value={fillValue}
              onChange={(event) => setFillValue(event.target.value)}
              className={`${inputClass} max-w-28 ring-slate-300`}
            >
              <option value="">Pilih</option>
              {predicates.map((label) => (
                <option key={label}>{label}</option>
              ))}
            </select>
          ) : (
            <input
              aria-label="Nilai untuk semua yang kosong"
              inputMode="decimal"
              value={fillValue}
              onChange={(event) => setFillValue(event.target.value)}
              className={`${inputClass} max-w-24 text-center ring-slate-300`}
            />
          )}
          <Button size="sm" variant="secondary" disabled={!fillValue} onClick={fillAll}>
            Isi ({fillEmpty(rows).length})
          </Button>
        </div>
      )}
      <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        {rows.map((row, index) => {
          const absent = row.status === 'tidak_hadir'
          const below = !absent && isBelowKkm(row.score, kkm)
          const error = errors[row.student]
          return (
            <li key={row.student} className={`px-3 py-2.5 sm:px-4 ${absent ? 'bg-slate-50' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-right text-sm text-slate-400">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{row.full_name}</p>
                  <p className="text-xs text-slate-500">{row.nis || '-'}</p>
                </div>
                {scale === 'predikat' ? (
                  <div className="flex gap-1">
                    {predicates.map((label) => (
                      <button
                        key={label}
                        type="button"
                        disabled={readOnly || absent}
                        aria-pressed={row.value === label}
                        onClick={() =>
                          update(row.student, { value: row.value === label ? '' : label })
                        }
                        className={`min-w-10 rounded-lg px-2 py-2 text-base font-bold ring-1 disabled:opacity-40 ${
                          row.value === label
                            ? below
                              ? 'bg-red-600 text-white ring-red-600'
                              : 'bg-brand-600 text-white ring-brand-600'
                            : 'bg-white text-slate-600 ring-slate-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    ref={(element) => (inputs.current[index] = element)}
                    aria-label={`Nilai ${row.full_name}`}
                    aria-invalid={Boolean(error)}
                    inputMode="decimal"
                    enterKeyHint="next"
                    disabled={readOnly || absent}
                    value={absent ? '' : row.value}
                    placeholder={absent ? '—' : ''}
                    onChange={(event) => update(row.student, { value: event.target.value })}
                    onFocus={(event) => event.target.select()}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return
                      event.preventDefault()
                      inputs.current
                        .slice(index + 1)
                        .find((el) => el && !el.disabled)
                        ?.focus()
                    }}
                    className={`w-20 rounded-lg border-0 px-2 py-2 text-center text-xl font-bold ring-1 ring-inset focus:ring-2 focus:ring-brand-600 disabled:bg-slate-100 sm:w-24 ${
                      error
                        ? 'text-red-700 ring-red-400'
                        : below
                          ? 'bg-red-50 text-red-700 ring-red-300'
                          : 'text-slate-900 ring-slate-300'
                    }`}
                  />
                )}
                {!readOnly && (
                  <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                    <button
                      type="button"
                      aria-pressed={absent}
                      onClick={() =>
                        update(row.student, { status: absent ? 'hadir' : 'tidak_hadir' })
                      }
                      title={absent ? 'Tandai hadir' : 'Tandai tidak hadir'}
                      className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium ring-1 ${
                        absent
                          ? 'bg-amber-100 text-amber-800 ring-amber-300'
                          : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <UserX className="size-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Tidak hadir</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenNote(openNote === row.student ? null : row.student)}
                      title="Catatan"
                      aria-label={`Catatan ${row.full_name}`}
                      className={`inline-flex items-center justify-center rounded-lg px-2 py-1.5 ring-1 ${
                        row.note
                          ? 'bg-sky-50 text-sky-700 ring-sky-200'
                          : 'bg-white text-slate-400 ring-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <MessageSquareText className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {absent && (
                <p className="mt-1 ml-9 text-xs font-medium text-amber-700">Tidak hadir</p>
              )}
              {error && <p className="mt-1 ml-9 text-xs font-medium text-red-600">{error}</p>}
              {(openNote === row.student || (readOnly && row.note)) && (
                <input
                  aria-label={`Isi catatan ${row.full_name}`}
                  placeholder="Catatan (opsional)"
                  maxLength={200}
                  disabled={readOnly}
                  value={row.note}
                  onChange={(event) => update(row.student, { note: event.target.value })}
                  className={`${inputClass} mt-2 ml-9 w-[calc(100%-2.25rem)] ring-slate-300`}
                />
              )}
            </li>
          )
        })}
      </ol>
      {rows.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">Belum ada siswa di kelas ini.</p>
      )}
    </div>
  )
}
