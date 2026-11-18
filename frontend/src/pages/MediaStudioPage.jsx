import { ArrowLeft, Eye, FileUp, History, Laptop, Rocket, Save, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useBlocker, useParams } from 'react-router-dom'
import { learningMediaApi, previewPlayApi } from '../api/learningMedia'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'
import TextField from '../components/TextField'
import useAuth from '../hooks/useAuth'
import useFetch from '../hooks/useFetch'
import MediaPlayer from '../mpi/MediaPlayer'
import { MediaSettingsEditor, PartEditor, StationEditor, StepEditor } from '../mpi/studio/Editors'
import { draftStats, getAt, updateAt } from '../mpi/studio'
import ImportMediaModal from '../mpi/studio/ImportMediaModal'
import Outline from '../mpi/studio/Outline'
import { ROLE_HOME } from '../utils/constants'
import { getErrorMessage } from '../utils/errors'
import { formatDate } from '../utils/media'

const LIST_LABELS = { steps: 'Langkah', remedial: 'Belajar ulang', challenge: 'Tantangan' }

/** Pesan kesalahan dari server: { draft: ["Bagian 1 › ...", ...] } atau pesan biasa. */
function errorList(error) {
  const draft = error?.response?.data?.draft
  if (Array.isArray(draft)) return draft
  return [getErrorMessage(error)]
}

function PreviewModal({ media, data, onClose }) {
  const { user } = useAuth()
  const [device, setDevice] = useState('phone')
  return (
    <Modal open size="xl" title={`Pratinjau: ${media.title}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-2" role="group" aria-label="Ukuran layar">
          <Button
            variant={device === 'phone' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setDevice('phone')}
          >
            <Smartphone className="size-4" aria-hidden="true" /> HP
          </Button>
          <Button
            variant={device === 'laptop' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setDevice('laptop')}
          >
            <Laptop className="size-4" aria-hidden="true" /> Laptop
          </Button>
        </div>
        <div
          className={`mx-auto rounded-2xl bg-surface p-4 ring-1 ring-slate-300 ${
            device === 'phone' ? 'max-w-[390px] ring-8 ring-slate-800' : 'w-full'
          }`}
        >
          <MediaPlayer
            data={data}
            api={previewPlayApi(media.id)}
            materialId={null}
            user={user}
            title={media.title}
          />
        </div>
      </div>
    </Modal>
  )
}

function PublishModal({ onClose, onPublish }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      open
      title="Terbitkan media"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true)
              await onPublish(note)
              setBusy(false)
            }}
          >
            <Rocket className="size-4" aria-hidden="true" /> Terbitkan
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-slate-700">
        <p>
          Versi baru langsung dipakai siswa di semua kelas yang memasang media ini. Progres siswa
          aman: bintang dan stasiun yang sudah selesai tidak hilang.
        </p>
        <TextField
          label="Catatan versi (opsional)"
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
          placeholder="mis. Memperbaiki soal stasiun 3"
        />
      </div>
    </Modal>
  )
}

function VersionsModal({ mediaId, onClose, onRestore }) {
  const { data, loading, error } = useFetch(learningMediaApi.versions, mediaId)
  return (
    <Modal open title="Riwayat versi" onClose={onClose}>
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <Alert type="error">{error}</Alert>
      ) : data.length === 0 ? (
        <p className="text-sm text-slate-500">Belum pernah diterbitkan.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.map((version) => (
            <li key={version.number} className="flex flex-wrap items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">Versi {version.number}</p>
                <p className="text-xs text-slate-500">
                  {formatDate(version.published_at)} • {version.published_by_name ?? '-'}
                  {version.note && ` • ${version.note}`}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => onRestore(version.number)}>
                Pulihkan ke draf
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

/** Studio Penyusun: susun media tanpa coding, pratinjau sebagai siswa, terbitkan. */
export default function MediaStudioPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { data: media, error: loadError, reload } = useFetch(learningMediaApi.get, id)
  const [draft, setDraftState] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [selected, setSelected] = useState({ part: 0, station: 0 })
  const [errors, setErrors] = useState([])
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [dialog, setDialog] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loadedId, setLoadedId] = useState(null)

  // Draf dari server dimuat sekali per media (ubahan lokal tidak ditimpa saat data dimuat ulang).
  if (media && loadedId !== media.id) {
    setLoadedId(media.id)
    setDraftState(media.draft)
  }

  const setDraft = (next) => {
    setDraftState(next)
    setDirty(true)
    setNotice('')
  }

  const save = useCallback(async () => {
    setBusy('save')
    setErrors([])
    try {
      const saved = await learningMediaApi.update(id, { draft })
      setDraftState(saved.draft)
      setDirty(false)
      setNotice('Draf tersimpan.')
      return true
    } catch (error) {
      setErrors(errorList(error))
      return false
    } finally {
      setBusy('')
    }
  }, [id, draft])

  // Ctrl+S = simpan. Peringatan jika meninggalkan halaman sebelum menyimpan.
  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (dirty) save()
      }
    }
    const onUnload = (event) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [dirty, save])
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  )

  if (loadError) return <Alert type="error">{loadError}</Alert>
  if (!media || !draft) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  const openPreview = async () => {
    setBusy('preview')
    setErrors([])
    try {
      setPreview(await learningMediaApi.preview(id, draft))
    } catch (error) {
      setErrors(errorList(error))
    } finally {
      setBusy('')
    }
  }
  const publish = async (note) => {
    setErrors([])
    if (dirty && !(await save())) {
      setDialog(null)
      return
    }
    try {
      const version = await learningMediaApi.publish(id, note)
      setDialog(null)
      setNotice(`Versi ${version.number} terbit. Siswa langsung melihat isi terbaru.`)
      reload()
    } catch (error) {
      setDialog(null)
      setErrors(errorList(error))
    }
  }
  const restore = async (number) => {
    if (dirty && !window.confirm('Ubahan yang belum disimpan akan hilang. Lanjutkan?')) return
    const restored = await learningMediaApi.restore(id, number)
    setDraftState(restored.draft)
    setDirty(false)
    setSelected({ part: 0, station: 0 })
    setDialog(null)
    setNotice(`Draf dipulihkan dari versi ${number}. Terbitkan agar terlihat siswa.`)
  }

  // Impor bekerja pada draf di server, jadi ubahan lokal disimpan dulu.
  const openImport = async () => {
    if (dirty && !(await save())) return
    setDialog('import')
  }
  const imported = (result) => {
    setDraftState(result.media.draft)
    setDirty(false)
    setDialog(null)
    const { stations, steps } = result.summary
    const first = result.mode === 'replace' ? 0 : Math.max(0, result.media.draft.parts.length - 1)
    setSelected(result.media.draft.parts.length ? { part: first } : { part: 0, station: 0 })
    setNotice(
      `Impor selesai: ${stations} stasiun, ${steps} langkah ${result.mode === 'replace' ? 'menggantikan isi lama' : 'ditambahkan'}. ` +
        'Periksa hasilnya, lalu Terbitkan agar terlihat siswa.' +
        (result.warnings.length ? ` (${result.warnings.length} catatan impor)` : ''),
    )
  }

  const item = selected === 'media' ? null : getAt(draft, selected)
  const change = (changes) =>
    setDraft(updateAt(draft, selected, (current) => ({ ...current, ...changes })))
  const replace = (next) => setDraft(updateAt(draft, selected, () => next))
  const stats = draftStats(draft)
  const allStations = draft.parts.flatMap((part) => part.stations)
  const version = media.latest_version
  // Media baru (belum terbit, paling banyak berisi stasiun contoh): tawarkan impor bahan.
  const starter = !version && stats.stations <= 1

  let editor = null
  if (selected === 'media') {
    editor = (
      <MediaSettingsEditor
        draft={draft}
        mediaId={media.id}
        onChange={(changes) => setDraft({ ...draft, ...changes })}
      />
    )
  } else if (!item) {
    editor = (
      <p className="text-sm text-slate-500">Pilih bagian, stasiun, atau langkah di daftar kiri.</p>
    )
  } else if (selected.step !== undefined) {
    editor = (
      <StepEditor
        key={item.id}
        step={item}
        listLabel={LIST_LABELS[selected.list]}
        number={selected.step + 1}
        mediaId={media.id}
        onChange={change}
        onReplace={replace}
      />
    )
  } else if (selected.station !== undefined) {
    const index = allStations.findIndex((station) => station.id === item.id)
    editor = (
      <StationEditor
        key={item.id}
        station={item}
        number={index + 1}
        earlier={allStations.slice(0, index)}
        onChange={change}
      />
    )
  } else {
    editor = <PartEditor key={item.id} part={item} number={selected.part + 1} onChange={change} />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={`${ROLE_HOME[user.role]}/media-interaktif`}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Daftar media
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-slate-900">{media.title}</h1>
          <p className="text-xs text-slate-500">
            {stats.parts} bagian • {stats.stations} stasiun • {stats.steps} langkah •{' '}
            {stats.practice} latihan • {version ? `terbit v${version.number}` : 'belum terbit'}
          </p>
        </div>
        {dirty ? (
          <Badge color="amber">Belum disimpan</Badge>
        ) : (
          <Badge color="green">Tersimpan</Badge>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={save} loading={busy === 'save'} disabled={!dirty}>
            <Save className="size-4" aria-hidden="true" /> Simpan
          </Button>
          <Button variant="secondary" onClick={openPreview} loading={busy === 'preview'}>
            <Eye className="size-4" aria-hidden="true" /> Pratinjau
          </Button>
          <Button
            variant="secondary"
            onClick={openImport}
            loading={busy === 'save' && dialog === null}
          >
            <FileUp className="size-4" aria-hidden="true" /> Impor
          </Button>
          <Button variant="secondary" onClick={() => setDialog('versions')}>
            <History className="size-4" aria-hidden="true" /> Riwayat
          </Button>
          <Button onClick={() => setDialog('publish')}>
            <Rocket className="size-4" aria-hidden="true" /> Terbitkan
          </Button>
        </div>
      </div>

      {notice && <Alert type="success">{notice}</Alert>}
      {errors.length > 0 && (
        <Alert type="error">
          <p className="font-semibold">Perbaiki dulu bagian berikut:</p>
          <ul className="mt-1 list-disc space-y-0.5 ps-5">
            {errors.slice(0, 15).map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
          {errors.length > 15 && <p className="mt-1">…dan {errors.length - 15} lainnya.</p>}
        </Alert>
      )}

      {starter && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-brand-50 p-4 ring-1 ring-brand-200">
          <FileUp className="size-8 text-brand-700" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-brand-900">
            <strong>Sudah punya bahan?</strong> Impor dari Excel, Word, PowerPoint, PDF, daftar
            tautan, atau bank soal agar tidak mengetik ulang.
          </p>
          <Button onClick={openImport}>Impor Bahan</Button>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[20rem_1fr]">
        <aside className="max-h-[70vh] overflow-y-auto rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-200 lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)]">
          <Outline draft={draft} setDraft={setDraft} selected={selected} select={setSelected} />
        </aside>
        <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
          {editor}
        </section>
      </div>

      {preview && <PreviewModal media={media} data={preview} onClose={() => setPreview(null)} />}
      {dialog === 'publish' && <PublishModal onClose={() => setDialog(null)} onPublish={publish} />}
      {dialog === 'import' && (
        <ImportMediaModal
          mediaId={media.id}
          hasContent={stats.stations > 0}
          preferReplace={starter}
          onClose={() => setDialog(null)}
          onImported={imported}
        />
      )}
      {dialog === 'versions' && (
        <VersionsModal mediaId={media.id} onClose={() => setDialog(null)} onRestore={restore} />
      )}
      {blocker.state === 'blocked' && (
        <Modal
          open
          title="Ubahan belum disimpan"
          onClose={() => blocker.reset()}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => blocker.proceed()}>
                Tinggalkan
              </Button>
              <Button onClick={() => blocker.reset()}>Tetap di sini</Button>
            </div>
          }
        >
          <p className="text-sm text-slate-700">
            Ubahan di Studio belum disimpan dan akan hilang jika Anda pergi.
          </p>
        </Modal>
      )}
    </div>
  )
}
