import {
  BookOpen,
  Copy,
  Download,
  Layers,
  Library,
  Pencil,
  Plus,
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { subjectsApi } from '../api/academics'
import { learningMediaApi } from '../api/learningMedia'
import { schoolsApi } from '../api/schools'
import AdminCard, { CardGrid } from '../components/AdminCard'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import Button from '../components/Button'
import DeleteDialog from '../components/DeleteDialog'
import EmptyState from '../components/EmptyState'
import FormModal from '../components/FormModal'
import Modal from '../components/Modal'
import PageHero, { HeroButton } from '../components/PageHero'
import SelectField from '../components/SelectField'
import Spinner from '../components/Spinner'
import TextAreaField from '../components/TextAreaField'
import TextField from '../components/TextField'
import useAuth from '../hooks/useAuth'
import useFetch from '../hooks/useFetch'
import useFormSubmit from '../hooks/useFormSubmit'
import useQueryFlag from '../hooks/useQueryFlag'
import { useTabs } from '../hooks/useTabs'
import { emptyDraft } from '../mpi/studio'
import { ALL, toOptions } from '../utils/academic'
import { ROLE_HOME, ROLES } from '../utils/constants'
import { getErrorMessage } from '../utils/errors'
import { saveBlob } from '../utils/media'

function NewMediaModal({ onClose, onCreated, withSubject }) {
  const [form, setForm] = useState({ title: '', description: '', subject: '' })
  const subjects = useFetch(withSubject ? subjectsApi.list : async () => ({ results: [] }), ALL)
  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const created = await learningMediaApi.create({
      ...form,
      subject: form.subject ? Number(form.subject) : null,
      draft: emptyDraft(),
    })
    onCreated(created)
  })
  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value })
  return (
    <FormModal
      title="Media Interaktif Baru"
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError}
    >
      <TextField
        label="Judul"
        name="title"
        value={form.title}
        onChange={change}
        error={errors.title}
        placeholder="Petualangan Flowgorithm"
        required
      />
      <TextAreaField
        label="Deskripsi (opsional)"
        name="description"
        value={form.description}
        onChange={change}
        rows={2}
      />
      {withSubject && (
        <SelectField
          label="Mata pelajaran (opsional)"
          name="subject"
          value={form.subject}
          onChange={change}
          options={toOptions(subjects.data?.results, (s) => s.name, '- Umum -')}
          error={errors.subject}
        />
      )}
      <p className="text-xs text-slate-500">
        Media baru berisi satu bagian dan satu stasiun contoh. Ubah isinya di Studio, lalu
        terbitkan.
      </p>
    </FormModal>
  )
}

function SharesModal({ media, onClose }) {
  const schools = useFetch(schoolsApi.list, ALL)
  const current = useFetch(learningMediaApi.shares, media.id)
  const [chosen, setChosen] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const selected = chosen ?? new Set(current.data?.schools ?? [])
  const toggle = (id) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setChosen(next)
  }
  const save = async () => {
    setSaving(true)
    try {
      await learningMediaApi.setShares(media.id, [...selected])
      setMessage('Tersimpan.')
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }
  const list = schools.data?.results ?? schools.data ?? []
  return (
    <Modal
      open
      title={`Bagikan “${media.title}”`}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-3">
          {message && <span className="text-sm text-slate-600">{message}</span>}
          <Button onClick={save} loading={saving}>
            Simpan
          </Button>
        </div>
      }
    >
      {schools.loading || current.loading ? (
        <Spinner />
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Guru di sekolah yang dicentang bisa melihat media ini di tab Pustaka lalu menyalinnya.
          </p>
          {list.map((school) => (
            <label key={school.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(school.id)}
                onChange={() => toggle(school.id)}
                className="size-4 rounded border-slate-300"
              />
              {school.name}
            </label>
          ))}
        </div>
      )}
    </Modal>
  )
}

/**
 * Daftar Media Interaktif (Studio Penyusun). Guru & admin sekolah: media sekolah + Pustaka yang
 * dibagikan. Super Admin di mode Super Admin: Pustaka Media global (bisa dibagikan ke sekolah).
 */
export default function MediaLibraryPage() {
  const { user, school } = useAuth()
  const navigate = useNavigate()
  const base = `${ROLE_HOME[user.role]}/media-interaktif`
  const platform = user.role === ROLES.FOUNDATION && !school
  const [tab, tabsBar] = useTabs(
    platform
      ? [{ id: 'mine', label: 'Pustaka Media' }]
      : [
          { id: 'mine', label: 'Media Sekolah' },
          { id: 'library', label: 'Pustaka' },
        ],
  )
  const openNew = useQueryFlag('baru') === '1'
  const [creating, setCreating] = useState(openNew)
  const [deleting, setDeleting] = useState(null)
  const [sharing, setSharing] = useState(null)
  const [message, setMessage] = useState('')
  const params = { ...ALL, ...(tab === 'library' ? { library: 1 } : {}) }
  const { data, loading, error, reload } = useFetch(learningMediaApi.list, params)
  const items = data?.results ?? []

  const copy = async (media) => {
    setMessage('')
    try {
      const created = await learningMediaApi.copy(media.id)
      navigate(`${base}/${created.id}`)
    } catch (err) {
      setMessage(getErrorMessage(err))
    }
  }
  const exportJson = async (media) => {
    try {
      const blob = await learningMediaApi.exportJson(media.id)
      saveBlob(URL.createObjectURL(blob), `media-${media.id}.json`)
    } catch (err) {
      setMessage(getErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        title={platform ? 'Pustaka Media Interaktif' : 'Media Interaktif'}
        description="Susun media belajar interaktif tanpa coding: stasiun, penjelasan, dan latihan yang dinilai otomatis."
        icons={[Sparkles, Layers, BookOpen, Library]}
        centerIcon={Sparkles}
        stats={[{ icon: Layers, content: `${data?.count ?? 0} media` }]}
        actions={
          <HeroButton icon={Plus} onClick={() => setCreating(true)}>
            Media Baru
          </HeroButton>
        }
      />
      {tabsBar}
      {message && <Alert type="error">{message}</Alert>}
      {loading && !data ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : error ? (
        <Alert type="error">{error}</Alert>
      ) : items.length === 0 ? (
        <EmptyState title={tab === 'library' ? 'Belum ada media di Pustaka' : 'Belum ada media'}>
          {tab === 'library'
            ? 'Media yang dibagikan Super Admin ke sekolah ini akan muncul di sini.'
            : 'Klik “Media Baru” untuk mulai menyusun media interaktif.'}
        </EmptyState>
      ) : (
        <CardGrid>
          {items.map((media) => (
            <AdminCard
              key={media.id}
              tone="bg-violet-50"
              icon={
                <span className="flex size-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                  <Sparkles className="size-5" aria-hidden="true" />
                </span>
              }
              title={media.title}
              subtitle={media.subject_name ?? 'Umum'}
              to={media.can_edit ? `${base}/${media.id}` : undefined}
              badges={
                media.latest_version ? (
                  <Badge color="green">Terbit v{media.latest_version.number}</Badge>
                ) : (
                  <Badge color="gray">Draf</Badge>
                )
              }
              meta={[
                { icon: Layers, content: `${media.station_count} stasiun` },
                { icon: BookOpen, content: `Dipakai di ${media.material_count} materi` },
                media.created_by_name && { icon: Pencil, content: `Oleh ${media.created_by_name}` },
              ]}
              actions={
                <>
                  {media.can_edit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate(`${base}/${media.id}`)}
                    >
                      <Pencil className="size-4" aria-hidden="true" /> Studio
                    </Button>
                  )}
                  {(media.latest_version || media.can_edit) && !platform && (
                    <Button size="sm" variant="ghost" onClick={() => copy(media)}>
                      <Copy className="size-4" aria-hidden="true" /> Salin
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => exportJson(media)}>
                    <Download className="size-4" aria-hidden="true" /> Ekspor
                  </Button>
                  {platform && (
                    <Button size="sm" variant="ghost" onClick={() => setSharing(media)}>
                      <Share2 className="size-4" aria-hidden="true" /> Bagikan
                    </Button>
                  )}
                  {media.can_edit && (
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(media)}>
                      <Trash2 className="size-4 text-red-600" aria-hidden="true" /> Hapus
                    </Button>
                  )}
                </>
              }
            />
          ))}
        </CardGrid>
      )}

      {creating && (
        <NewMediaModal
          withSubject={!platform}
          onClose={() => setCreating(false)}
          onCreated={(created) => navigate(`${base}/${created.id}`)}
        />
      )}
      {sharing && <SharesModal media={sharing} onClose={() => setSharing(null)} />}
      <DeleteDialog
        item={deleting}
        title="Hapus media?"
        message={`Media “${deleting?.title}” beserta gambar dan riwayat versinya akan dihapus. Media yang dipakai materi tidak bisa dihapus.`}
        onDelete={(media) => learningMediaApi.remove(media.id)}
        onDeleted={() => {
          setDeleting(null)
          reload()
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
