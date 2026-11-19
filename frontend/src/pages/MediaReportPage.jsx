import { ArrowLeft, Eye, MessageCircle, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { mediaReportApi } from '../api/learningMedia'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import FileDownloadButton from '../components/FileDownloadButton'
import Spinner from '../components/Spinner'
import TextAreaField from '../components/TextAreaField'
import useAuth from '../hooks/useAuth'
import useFetch from '../hooks/useFetch'
import { useTabs } from '../hooks/useTabs'
import {
  defaultReminder,
  formatGain,
  formatScore,
  lastActiveText,
  NGAIN_TONES,
  percent,
  stationCell,
} from '../mpi/report'
import { ROLE_HOME } from '../utils/constants'
import { getErrorMessage } from '../utils/errors'

const TABS = [
  { id: 'progres', label: 'Progres' },
  { id: 'kesulitan', label: 'Kesulitan' },
  { id: 'ngain', label: 'N-Gain' },
  { id: 'aktif', label: 'Tidak aktif' },
  { id: 'refleksi', label: 'Refleksi' },
]

function Tile({ label, value, hint }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-semibold text-slate-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function ProgressTable({ report }) {
  const { stations, rows } = report
  if (!rows.length) return <EmptyState title="Belum ada siswa di kelas ini." />
  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-600">
          <tr>
            <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Siswa</th>
            <th className="px-2 py-2">Selesai</th>
            {stations.map((station, i) => (
              <th key={station.id} className="px-1.5 py-2 text-center" title={station.title}>
                {i + 1}
                {station.optional ? '*' : ''}
              </th>
            ))}
            <th className="px-2 py-2">Bintang</th>
            <th className="px-2 py-2">Menit</th>
            <th className="px-2 py-2">Terakhir aktif</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.student}>
              <td className="sticky left-0 bg-white px-3 py-1.5 font-medium whitespace-nowrap">
                {row.name}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                <Badge color={row.finished ? 'green' : row.done ? 'amber' : 'gray'}>
                  {row.done}/{row.required}
                </Badge>
              </td>
              {stations.map((station) => {
                const cell = stationCell(row.stations[station.id])
                return (
                  <td
                    key={station.id}
                    title={station.title}
                    className={`px-1.5 py-1.5 text-center text-xs whitespace-nowrap ${
                      cell.done
                        ? 'bg-brand-50 text-amber-500'
                        : cell.started
                          ? 'text-amber-400'
                          : 'text-slate-300'
                    }`}
                  >
                    {cell.text}
                  </td>
                )
              })}
              <td className="px-2 py-1.5">{row.stars}</td>
              <td className="px-2 py-1.5">{row.minutes}</td>
              <td
                className={`px-2 py-1.5 whitespace-nowrap ${row.inactive ? 'font-semibold text-red-600' : ''}`}
              >
                {lastActiveText(row.last_active)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2 text-xs text-slate-500">
        Nomor kolom = urutan stasiun (arahkan kursor untuk melihat judul). * = opsional. Latar hijau
        = selesai.
      </p>
    </div>
  )
}

function Difficulty({ rows }) {
  if (!rows.length)
    return (
      <EmptyState title="Belum cukup jawaban untuk dianalisis.">
        Langkah baru muncul di sini setelah minimal 3 jawaban.
      </EmptyState>
    )
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.step} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">
                {row.station} · {row.where} · {row.kind}
              </p>
              <p className="font-semibold text-slate-900">{row.caption || '(tanpa judul)'}</p>
            </div>
            <Badge color={row.wrong_rate >= 50 ? 'red' : row.wrong_rate >= 25 ? 'amber' : 'green'}>
              {row.wrong_rate}% salah
            </Badge>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-red-400"
              style={{ width: `${row.wrong_rate}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {row.wrong} dari {row.attempts} jawaban salah · {row.wrong_students} dari {row.students}{' '}
            siswa pernah salah
          </p>
          {row.top_wrong.length > 0 && (
            <div className="mt-2 text-sm">
              <p className="font-semibold text-slate-700">Jawaban salah terbanyak:</p>
              <ul className="mt-1 list-disc space-y-0.5 ps-5 text-slate-700">
                {row.top_wrong.map((item) => (
                  <li key={item.answer}>
                    <span className="font-mono">{item.answer}</span>{' '}
                    <span className="text-slate-500">({item.count}×)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function NGain({ report }) {
  const { pretest, posttest, rows, summary } = report
  if (!pretest || !posttest)
    return (
      <Alert type="info">
        N-Gain membutuhkan Tes Awal dan Tes Akhir. Atur keduanya di form materi (bagian Media
        Interaktif).
      </Alert>
    )
  const counts = summary.ngain_counts ?? {}
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        N-Gain = (Tes Akhir − Tes Awal) / (100 − Tes Awal), memakai nilai pengerjaan pertama{' '}
        {pretest.title} dan {posttest.title}. Tinggi ≥ 0,7 · Sedang 0,3–0,7 · Rendah &lt; 0,3.
      </p>
      <div className="flex flex-wrap gap-2">
        {['Tinggi', 'Sedang', 'Rendah'].map((name) => (
          <Badge key={name} color={NGAIN_TONES[name]}>
            {name}: {counts[name] ?? 0} siswa
          </Badge>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">Siswa</th>
              <th className="px-3 py-2">Tes Awal</th>
              <th className="px-3 py-2">Tes Akhir</th>
              <th className="px-3 py-2">N-Gain</th>
              <th className="px-3 py-2">Kategori</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.student}>
                <td className="px-3 py-1.5 font-medium">{row.name}</td>
                <td className="px-3 py-1.5">{formatScore(row.pretest)}</td>
                <td className="px-3 py-1.5">{formatScore(row.posttest)}</td>
                <td className="px-3 py-1.5 font-mono">{formatGain(row.ngain)}</td>
                <td className="px-3 py-1.5">
                  {row.ngain_category ? (
                    <Badge color={NGAIN_TONES[row.ngain_category]}>{row.ngain_category}</Badge>
                  ) : (
                    <span className="text-xs text-slate-400">
                      {row.pretest === null ? 'belum Tes Awal' : 'belum Tes Akhir'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Inactive({ report, materialId }) {
  const inactive = report.rows.filter((row) => row.inactive)
  const [selected, setSelected] = useState(() => inactive.map((row) => row.student))
  const [message, setMessage] = useState(() => defaultReminder(report.media_title))
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  if (!inactive.length)
    return (
      <EmptyState
        title={`Semua siswa aktif dalam ${report.inactive_days} hari terakhir atau sudah tuntas.`}
      />
    )
  const toggle = (id) =>
    setSelected(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  const send = async () => {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      setResult(await mediaReportApi.remind(materialId, selected, message))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Siswa yang belum tuntas dan tidak membuka media selama {report.inactive_days} hari atau
        lebih.
      </p>
      <div className="space-y-1 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
        {inactive.map((row) => (
          <label
            key={row.student}
            className="flex items-center gap-3 rounded-md p-1.5 text-sm hover:bg-slate-50"
          >
            <input
              type="checkbox"
              checked={selected.includes(row.student)}
              onChange={() => toggle(row.student)}
              className="size-4 rounded border-slate-300"
            />
            <span className="flex-1 font-medium">{row.name}</span>
            <span className="text-xs text-slate-500">
              {row.done}/{row.required} stasiun · {lastActiveText(row.last_active)}
            </span>
          </label>
        ))}
      </div>
      <TextAreaField
        label="Pesan pengingat (dikirim lewat Ruang Obrolan)"
        value={message}
        rows={3}
        hint="{nama} diganti nama depan siswa."
        onChange={(event) => setMessage(event.target.value)}
      />
      <Button onClick={send} loading={busy} disabled={!selected.length || !message.trim()}>
        <MessageCircle className="size-4" aria-hidden="true" /> Kirim ke {selected.length} siswa
      </Button>
      {result && (
        <Alert type="success">
          Pengingat terkirim ke {result.sent} siswa.
          {result.skipped.length > 0 && ` Tidak terkirim: ${result.skipped.join(', ')}.`}
        </Alert>
      )}
      <Alert type="error">{error}</Alert>
    </div>
  )
}

function Reflections({ rows }) {
  if (!rows.length) return <EmptyState title="Belum ada refleksi siswa." />
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{row.student}</span> · {row.station} ·{' '}
            {new Date(row.updated_at).toLocaleDateString('id-ID')}
          </p>
          <p className="mt-1 text-sm whitespace-pre-line text-slate-800">{row.text}</p>
        </div>
      ))}
    </div>
  )
}

/** Laporan Media Interaktif satu materi (kelas): progres, kesulitan, N-Gain, siswa tidak aktif, refleksi. */
export default function MediaReportPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: report, error, loading, reload } = useFetch(mediaReportApi.get, id)
  const [tab, tabsBar] = useTabs(TABS)

  if (error) return <Alert type="error">{error}</Alert>
  if (!report)
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  const { summary } = report
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Kembali
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Laporan: {report.title}</h1>
          <p className="text-sm text-slate-500">
            {report.media_title} · {report.classroom} ·{' '}
            {report.version ? `versi ${report.version}` : 'media belum terbit'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={reload} loading={loading}>
            <RefreshCw className="size-4" aria-hidden="true" /> Muat ulang
          </Button>
          <Link
            to={`${ROLE_HOME[user.role]}/media/${id}`}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            <Eye className="size-4" aria-hidden="true" /> Pratinjau
          </Link>
          <FileDownloadButton
            fetchBlob={() => mediaReportApi.exportXlsx(id)}
            filename={`laporan-media-${id}.xlsx`}
          >
            Ekspor Excel
          </FileDownloadButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Tuntas"
          value={`${summary.finished}/${summary.students}`}
          hint={`${percent(summary.finished, summary.students)}% siswa · ${summary.started} sudah mulai`}
        />
        <Tile
          label="Rata-rata bintang"
          value={summary.average_stars}
          hint="per siswa, semua stasiun"
        />
        <Tile
          label="Rata-rata N-Gain"
          value={formatGain(summary.average_ngain)}
          hint={summary.ngain_category || 'butuh Tes Awal & Akhir'}
        />
        <Tile
          label="Tidak aktif"
          value={summary.inactive}
          hint={`≥ ${report.inactive_days} hari & belum tuntas`}
        />
      </div>

      {tabsBar}
      {tab === 'progres' && <ProgressTable report={report} />}
      {tab === 'kesulitan' && <Difficulty rows={report.difficulty} />}
      {tab === 'ngain' && <NGain report={report} />}
      {tab === 'aktif' && <Inactive report={report} materialId={id} />}
      {tab === 'refleksi' && <Reflections rows={report.reflections} />}
    </div>
  )
}
