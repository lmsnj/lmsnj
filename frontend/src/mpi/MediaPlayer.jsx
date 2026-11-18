import {
  Award,
  BookOpen,
  ClipboardCheck,
  Eye,
  FileText,
  Maximize,
  Minimize,
  Play,
  Sparkles,
  Star,
  Trophy,
  Type,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Alert from '../components/Alert'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'
import { ROLES } from '../utils/constants'
import { getErrorMessage } from '../utils/errors'
import {
  achievements,
  clampScale,
  flattenStations,
  FONT_SCALES,
  nextStation,
  personalize,
} from './engine'
import { flush } from './offlineQueue'
import StationMap from './StationMap'
import StepPlayer from './StepPlayer'
import { Mascot, Rich } from './steps/ExplainSteps'

const PREFS_KEY = 'mpi-tampilan'

function loadPrefs() {
  try {
    return { scale: 1, calm: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }
  } catch {
    return { scale: 1, calm: false }
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Hanya kenyamanan tampilan; aman jika gagal.
  }
}

function GlossaryModal({ glossary, onClose, user }) {
  const [query, setQuery] = useState('')
  const items = glossary.filter((entry) =>
    `${entry.term} ${entry.meaning}`.toLowerCase().includes(query.trim().toLowerCase()),
  )
  return (
    <Modal open title="Glosarium" onClose={onClose}>
      <div className="space-y-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari istilah…"
          aria-label="Cari istilah"
          className="block w-full rounded-lg border-0 px-3 py-2 text-base ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-brand-600 sm:text-sm"
        />
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">Istilah tidak ditemukan.</p>
        ) : (
          <dl className="divide-y divide-slate-100">
            {items.map((entry) => (
              <div key={entry.term} className="py-2">
                <dt className="font-semibold text-slate-900">{entry.term}</dt>
                <dd className="text-sm text-slate-700">
                  <Rich text={entry.meaning} user={user} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </Modal>
  )
}

function AchievementsModal({ data, onClose, onContinue }) {
  const summary = achievements(data)
  const cards = [
    {
      icon: Star,
      label: 'Bintang',
      value: `${summary.stars} / ${summary.maxStars}`,
      tile: 'bg-amber-100 text-amber-700',
    },
    {
      icon: ClipboardCheck,
      label: 'Stasiun selesai',
      value: `${summary.done} / ${summary.total}`,
      tile: 'bg-brand-100 text-brand-700',
    },
    {
      icon: Sparkles,
      label: 'Sempurna (3 bintang)',
      value: summary.perfect,
      tile: 'bg-violet-100 text-violet-700',
    },
    {
      icon: BookOpen,
      label: 'Waktu belajar',
      value: `${summary.minutes} menit`,
      tile: 'bg-sky-100 text-sky-700',
    },
  ]
  return (
    <Modal open title="Prestasiku" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {cards.map(({ icon: Icon, label, value, tile }) => (
            <div key={label} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <span className={`mb-2 flex size-9 items-center justify-center rounded-lg ${tile}`}>
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <p className="text-lg font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>
        <div>
          <p className="mb-2 font-semibold text-slate-900">Lencana</p>
          {data.badges.length === 0 ? (
            <p className="text-sm text-slate-500">
              Belum ada lencana. Selesaikan stasiun untuk mendapatkannya.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {data.badges.map((badge) => (
                <li
                  key={badge.code}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800"
                >
                  <Award className="size-4" aria-hidden="true" /> {badge.title}
                </li>
              ))}
            </ul>
          )}
        </div>
        {[
          ['Tes Awal', data.pretest],
          ['Tes Akhir', data.posttest],
        ]
          .filter(([, test]) => test)
          .map(([label, test]) => (
            <p key={label} className="text-sm text-slate-700">
              {label}: {test.title} — <b>{test.done ? 'sudah dikerjakan' : 'belum dikerjakan'}</b>
            </p>
          ))}
        {data.resume && (
          <Button onClick={onContinue}>
            <Play className="size-4" aria-hidden="true" /> Lanjutkan di sini
          </Button>
        )}
      </div>
    </Modal>
  )
}

function LeaderboardModal({ api, materialId, onClose }) {
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    api
      .leaderboard(materialId)
      .then((data) => setState({ data }))
      .catch((error) => setState({ error: getErrorMessage(error) }))
  }, [api, materialId])
  return (
    <Modal open title="Papan Peringkat" onClose={onClose}>
      {state.loading ? (
        <Spinner />
      ) : state.error ? (
        <Alert type="error">{state.error}</Alert>
      ) : state.data.rows.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada yang mulai. Jadilah yang pertama!</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            Fokus pada kemajuanmu sendiri. Siswa yang belum mulai tidak ditampilkan.
          </p>
          <ol className="divide-y divide-slate-100">
            {state.data.rows.map((row) => (
              <li
                key={row.rank}
                className={`flex items-center gap-3 py-2 ${row.is_me ? 'font-bold text-brand-800' : ''}`}
              >
                <span className="w-6 text-end text-slate-500">{row.rank}</span>
                <span className="flex-1">
                  {row.name}
                  {row.is_me && ' (kamu)'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Star className="size-4 fill-amber-400 text-amber-500" aria-hidden="true" />{' '}
                  {row.stars}
                </span>
                <span className="w-16 text-end text-xs text-slate-500">
                  {row.completed} stasiun
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Modal>
  )
}

function ToolButton({ icon: Icon, children, ...props }) {
  return (
    <button
      type="button"
      className="flex min-h-11 items-center gap-1.5 rounded-lg bg-white px-3 text-[0.85em] font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
      {...props}
    >
      <Icon className="size-4" aria-hidden="true" />
      {children}
    </button>
  )
}

function TestCard({ label, test, user }) {
  if (!test) return null
  const to = user.role === ROLES.STUDENT ? `/siswa/asesmen/${test.id}` : null
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <span className="flex size-10 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
        <ClipboardCheck className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-slate-500">{label}</span>
        <span className="block font-semibold text-slate-900">{test.title}</span>
      </span>
      {test.done ? (
        <span className="text-sm font-semibold text-brand-700">Sudah dikerjakan</span>
      ) : to ? (
        <Link
          to={to}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Kerjakan
        </Link>
      ) : null}
    </div>
  )
}

/**
 * Pemutar Media Pembelajaran Interaktif: peta stasiun -> stasiun (langkah demi langkah).
 * `data` = respons /api/materials/{id}/media/ (atau pratinjau Studio); `api` = mediaPlayApi atau
 * previewPlayApi. `printTo` = alamat Lembar Ringkas.
 */
export default function MediaPlayer({ data, api, materialId, user, title, onReload, printTo }) {
  const [current, setCurrent] = useState(null)
  // Keadaan stasiun dari server + ubahan lokal setelah menjawab; dibuang saat data dimuat ulang.
  const [local, setLocal] = useState({ source: data.stations, stations: data.stations })
  const stations = local.source === data.stations ? local.stations : data.stations
  const [dialog, setDialog] = useState(null)
  const [prefs, setPrefs] = useState(loadPrefs)
  const [fullscreen, setFullscreen] = useState(false)
  const rootRef = useRef(null)
  const list = flattenStations(data.content)
  const station = list.find((item) => item.id === current)
  const readOnly = data.read_only !== false
  const mascot = data.content.mascot

  // Kirim antrean yang tertunda (posisi/refleksi) saat halaman dibuka & saat sinyal kembali.
  useEffect(() => {
    if (readOnly) return
    flush(api)
    const retry = () => flush(api)
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [api, readOnly])

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === rootRef.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  const updatePrefs = (changes) => {
    const next = { ...prefs, ...changes }
    setPrefs(next)
    savePrefs(next)
  }
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else rootRef.current?.requestFullscreen?.().catch(() => {})
  }
  const onStepState = (stationId, stepId, stepState) => {
    const all = stations
    setLocal({
      source: data.stations,
      stations: {
        ...all,
        [stationId]: {
          ...all[stationId],
          run: { ...all[stationId].run, [stepId]: stepState },
          last_step_id: stepId,
        },
      },
    })
  }
  const open = (stationId) => {
    setCurrent(stationId)
    setDialog(null)
  }
  const next = station ? nextStation(list, stations, station.id) : null
  const scale = FONT_SCALES[clampScale(prefs.scale)]

  return (
    <div
      ref={rootRef}
      style={{ fontSize: `${scale}rem` }}
      className={`space-y-4 ${prefs.calm ? '[&_*]:!animate-none [&_*]:!transition-none' : ''} ${
        fullscreen ? 'overflow-y-auto bg-surface p-4 sm:p-6' : ''
      }`}
    >
      <header className="flex flex-wrap items-center gap-3">
        <Mascot mascot={mascot} size="size-12" />
        <div className="min-w-0 flex-1">
          <p className="text-[0.8em] font-semibold text-brand-700">Media Interaktif</p>
          <h1 className="text-[1.3em] leading-tight font-bold text-slate-900">{title}</h1>
          <p className="text-[0.85em] text-slate-600">
            <Star className="inline size-4 fill-amber-400 text-amber-500" aria-hidden="true" />{' '}
            {achievements({ ...data, stations }).stars} / {data.totals.max_stars} bintang •{' '}
            {data.totals.completed}/{data.totals.stations} stasiun selesai
          </p>
        </div>
      </header>

      {data.preview && (
        <Alert type="info">
          <span className="flex items-center gap-2">
            <Eye className="size-4" aria-hidden="true" /> Pratinjau sebagai siswa: semua stasiun
            terbuka dan jawaban tidak disimpan.
          </span>
        </Alert>
      )}
      {!data.preview && readOnly && (
        <Alert type="warning">
          Mode lihat saja: Anda sedang masuk sebagai siswa, progres tidak berubah.
        </Alert>
      )}

      {/* Satu baris yang bisa digeser di HP agar isi pelajaran tidak terdorong ke bawah. */}
      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 [&>*]:shrink-0"
        role="toolbar"
        aria-label="Alat media"
      >
        <ToolButton icon={BookOpen} onClick={() => setDialog('glossary')}>
          Glosarium
        </ToolButton>
        <ToolButton icon={Trophy} onClick={() => setDialog('achievements')}>
          Prestasiku
        </ToolButton>
        {data.settings.leaderboard && !data.preview && (
          <ToolButton icon={Award} onClick={() => setDialog('leaderboard')}>
            Peringkat
          </ToolButton>
        )}
        {printTo && (
          <Link
            to={printTo}
            target="_blank"
            className="flex min-h-11 items-center gap-1.5 rounded-lg bg-white px-3 text-[0.85em] font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            <FileText className="size-4" aria-hidden="true" /> Lembar Ringkas
          </Link>
        )}
        <ToolButton
          icon={Type}
          onClick={() => updatePrefs({ scale: (clampScale(prefs.scale) + 1) % FONT_SCALES.length })}
          aria-label={`Ukuran huruf ${Math.round(scale * 100)}%`}
        >
          {Math.round(scale * 100)}%
        </ToolButton>
        <ToolButton
          icon={Sparkles}
          onClick={() => updatePrefs({ calm: !prefs.calm })}
          aria-pressed={prefs.calm}
        >
          {prefs.calm ? 'Animasi mati' : 'Kurangi animasi'}
        </ToolButton>
        <ToolButton icon={fullscreen ? Minimize : Maximize} onClick={toggleFullscreen}>
          {fullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
        </ToolButton>
      </div>

      {station ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => setCurrent(null)}>
              ← Peta stasiun
            </Button>
            <h2 className="text-[1.1em] font-bold text-slate-900">
              Stasiun {station.number}: {personalize(station.title, user)}
            </h2>
          </div>
          <StepPlayer
            key={station.id}
            station={station}
            state={stations[station.id]}
            version={data.version}
            materialId={materialId}
            api={api}
            user={user}
            mascot={mascot}
            readOnly={readOnly}
            reflection={data.reflections?.[station.id]}
            onStepState={onStepState}
            onFinished={onReload}
            onMap={() => setCurrent(null)}
            onNext={next ? () => open(next.id) : null}
            onGlossary={() => setDialog('glossary')}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {data.resume && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-brand-600 p-4 text-white shadow-sm">
              <p className="min-w-0 flex-1 font-semibold">
                {personalize('Siap belajar lagi, {nama_panggilan}?', user)}
              </p>
              <button
                type="button"
                onClick={() => open(data.resume.station_id)}
                className="flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 font-bold text-brand-700"
              >
                <Play className="size-4" aria-hidden="true" /> Lanjutkan dari terakhir
              </button>
            </div>
          )}
          <TestCard label="Tes Awal" test={data.pretest} user={user} />
          <StationMap content={data.content} states={stations} onOpen={open} />
          <TestCard label="Tes Akhir" test={data.posttest} user={user} />
        </div>
      )}

      {dialog === 'glossary' && (
        <GlossaryModal
          glossary={data.content.glossary ?? []}
          user={user}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'achievements' && (
        <AchievementsModal
          data={{ ...data, stations }}
          onClose={() => setDialog(null)}
          onContinue={() => open(data.resume.station_id)}
        />
      )}
      {dialog === 'leaderboard' && (
        <LeaderboardModal api={api} materialId={materialId} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}
