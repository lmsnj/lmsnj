import { Link } from 'react-router-dom'
import { learningMediaApi } from '../../api/learningMedia'
import SelectField from '../../components/SelectField'
import useAuth from '../../hooks/useAuth'
import useFetch from '../../hooks/useFetch'
import { ALL, toOptions } from '../../utils/academic'
import { ROLE_HOME } from '../../utils/constants'

const noMedia = async () => null

/** "2026-11-20T07:00:00+07:00" -> nilai input datetime-local (waktu lokal). */
function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Pilihan media & pengaturan per kelas di form Materi (tipe "Media Interaktif").
 * `value` = { interactive_media, media_settings }, `assessments` = asesmen kelas-mapel ini.
 */
export default function MediaMaterialFields({ value, onChange, assessments, errors }) {
  const { user } = useAuth()
  const media = useFetch(learningMediaApi.list, ALL)
  const published = (media.data?.results ?? []).filter((item) => item.latest_version)
  const detail = useFetch(
    value.interactive_media ? learningMediaApi.get : noMedia,
    value.interactive_media || null,
  )
  const settings = {
    unlock: 'sequential',
    leaderboard: true,
    schedule: {},
    pretest: null,
    posttest: null,
    ...value.media_settings,
  }
  const setSettings = (changes) =>
    onChange({ ...value, media_settings: { ...settings, ...changes } })
  const stations = (detail.data?.draft?.parts ?? []).flatMap((part) => part.stations)
  const testOptions = toOptions(assessments, (a) => a.title, '- Tidak ada -')

  return (
    <fieldset className="space-y-3 rounded-lg bg-violet-50 p-3 ring-1 ring-violet-200">
      <legend className="px-1 text-sm font-semibold text-violet-900">Media Interaktif</legend>
      <SelectField
        label="Media"
        value={value.interactive_media ? String(value.interactive_media) : ''}
        onChange={(event) =>
          onChange({
            ...value,
            interactive_media: event.target.value ? Number(event.target.value) : null,
          })
        }
        options={toOptions(
          published,
          (m) => `${m.title} (v${m.latest_version.number}, ${m.station_count} stasiun)`,
          '- Pilih media yang sudah terbit -',
        )}
        error={errors.interactive_media}
        required
        hint={
          published.length === 0 && !media.loading
            ? 'Belum ada media terbit. Buat di menu Media Interaktif.'
            : undefined
        }
      />
      <Link
        to={`${ROLE_HOME[user.role]}/media-interaktif`}
        target="_blank"
        className="text-xs font-semibold text-violet-800 underline"
      >
        Buka Studio Media Interaktif
      </Link>

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Aturan buka stasiun"
          value={settings.unlock}
          onChange={(event) => setSettings({ unlock: event.target.value })}
          options={[
            { value: 'sequential', label: 'Berurutan (selesaikan dulu stasiun sebelumnya)' },
            { value: 'free', label: 'Bebas (semua stasiun terbuka)' },
          ]}
        />
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={settings.leaderboard}
            onChange={(event) => setSettings({ leaderboard: event.target.checked })}
            className="size-4 rounded border-slate-300"
          />
          Tampilkan papan peringkat
        </label>
        <SelectField
          label="Tes Awal (wajib sebelum stasiun pertama)"
          value={settings.pretest ? String(settings.pretest) : ''}
          onChange={(event) =>
            setSettings({ pretest: event.target.value ? Number(event.target.value) : null })
          }
          options={testOptions}
        />
        <SelectField
          label="Tes Akhir"
          value={settings.posttest ? String(settings.posttest) : ''}
          onChange={(event) =>
            setSettings({ posttest: event.target.value ? Number(event.target.value) : null })
          }
          options={testOptions}
        />
      </div>
      {errors.media_settings && <p className="text-xs text-red-600">{errors.media_settings}</p>}

      {stations.length > 0 && (
        <details className="rounded-md bg-white p-2 ring-1 ring-violet-200">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Jadwal buka per stasiun (opsional)
          </summary>
          <div className="mt-2 space-y-2">
            {stations.map((station) => (
              <label
                key={station.id}
                className="grid items-center gap-1 text-sm sm:grid-cols-[1fr_14rem]"
              >
                <span className="truncate text-slate-700">{station.title}</span>
                <input
                  type="datetime-local"
                  value={toLocalInput(settings.schedule?.[station.id])}
                  onChange={(event) => {
                    const schedule = { ...settings.schedule }
                    if (event.target.value)
                      schedule[station.id] = new Date(event.target.value).toISOString()
                    else delete schedule[station.id]
                    setSettings({ schedule })
                  }}
                  className="rounded-md border-0 px-2 py-1 text-base ring-1 ring-slate-300 sm:text-sm"
                />
              </label>
            ))}
          </div>
        </details>
      )}
    </fieldset>
  )
}
