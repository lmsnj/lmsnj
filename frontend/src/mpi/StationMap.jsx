import { CircleCheck, Clock, Lock, Play, PlayCircle } from 'lucide-react'
import { flattenStations, stationStatus } from './engine'
import { Stars } from './StepPlayer'

const STATUS = {
  locked: { icon: Lock, tile: 'bg-slate-100 text-slate-400', label: 'Terkunci' },
  done: { icon: CircleCheck, tile: 'bg-brand-100 text-brand-700', label: 'Selesai' },
  progress: { icon: PlayCircle, tile: 'bg-amber-100 text-amber-700', label: 'Sedang dipelajari' },
  open: { icon: Play, tile: 'bg-sky-100 text-sky-700', label: 'Terbuka' },
}

/** Peta stasiun per bagian: status (terkunci/terbuka/sedang/selesai), bintang, perkiraan durasi. */
export default function StationMap({ content, states, onOpen }) {
  const stations = flattenStations(content)
  return (
    <div className="space-y-6">
      {content.parts.map((part, partIndex) => (
        <section key={part.id} aria-labelledby={`bagian-${part.id}`} className="space-y-3">
          <div>
            <h2 id={`bagian-${part.id}`} className="text-[1.1em] font-bold text-slate-900">
              Bagian {partIndex + 1}: {part.title}
            </h2>
            {part.description && <p className="text-[0.9em] text-slate-600">{part.description}</p>}
          </div>
          <ol className="grid gap-3 md:grid-cols-2">
            {stations
              .filter((station) => station.partId === part.id)
              .map((station) => {
                const state = states[station.id]
                const status = stationStatus(state)
                const { icon: Icon, tile, label } = STATUS[status]
                const locked = status === 'locked'
                return (
                  <li key={station.id}>
                    <button
                      type="button"
                      onClick={() => !locked && onOpen(station.id)}
                      aria-disabled={locked}
                      className={`flex w-full items-start gap-3 rounded-xl bg-white p-4 text-start shadow-sm ring-1 transition ${
                        locked
                          ? 'cursor-not-allowed ring-slate-200'
                          : 'ring-slate-200 hover:ring-brand-400 focus-visible:ring-2 focus-visible:ring-brand-600'
                      }`}
                    >
                      <span
                        className={`flex size-12 shrink-0 flex-col items-center justify-center rounded-xl ${tile}`}
                      >
                        <Icon className="size-5" aria-hidden="true" />
                        <span className="text-[0.7em] font-bold">{station.number}</span>
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block font-semibold text-slate-900">{station.title}</span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8em] text-slate-500">
                          <span>{label}</span>
                          {station.minutes > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="size-3" aria-hidden="true" /> {station.minutes}{' '}
                              menit
                            </span>
                          )}
                          {station.optional && (
                            <span className="rounded bg-slate-100 px-1.5">Opsional</span>
                          )}
                        </span>
                        {status === 'done' && <Stars value={state.stars} size="size-4" />}
                        {locked && state?.locked_by && (
                          <span className="block text-[0.8em] text-slate-500">
                            {state.locked_by}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
          </ol>
        </section>
      ))}
    </div>
  )
}
