import { ArrowDown, ArrowUp, CopyPlus, Plus, Settings2, Trash2 } from 'lucide-react'
import { stepDefinition } from '../registry'
import {
  containerOf,
  duplicateInList,
  moveInList,
  newPart,
  newStation,
  newStep,
  removeFromList,
  samePath,
  STATION_TEMPLATES,
  STEP_KINDS,
} from '../studio'
import { IconButton } from './fields'

const GRADED = new Set([
  'choice',
  'true_false',
  'ordering',
  'categorize',
  'hotspot',
  'fill_blank',
  'drag_drop',
  'matching',
])
const LISTS = [
  { id: 'steps', label: 'Langkah' },
  { id: 'remedial', label: 'Belajar ulang' },
  { id: 'challenge', label: 'Tantangan' },
]

/** Pilihan jenis langkah: Penjelasan / Latihan. */
export function KindSelect({
  value,
  onChange,
  label = 'Tambah langkah',
  placeholder = '+ Langkah…',
}) {
  const option = (kind) => (
    <option key={kind} value={kind}>
      {stepDefinition(kind)?.label ?? kind}
    </option>
  )
  return (
    <select
      aria-label={label}
      value={value ?? ''}
      onChange={(event) => event.target.value && onChange(event.target.value)}
      className="block w-full rounded-md border-0 bg-white px-2 py-1.5 text-sm text-brand-700 ring-1 ring-brand-300 ring-inset focus:ring-2 focus:ring-brand-600"
    >
      {placeholder && <option value="">{placeholder}</option>}
      <optgroup label="Penjelasan">{STEP_KINDS.filter((k) => !GRADED.has(k)).map(option)}</optgroup>
      <optgroup label="Latihan (dinilai)">
        {STEP_KINDS.filter((k) => GRADED.has(k)).map(option)}
      </optgroup>
    </select>
  )
}

function Row({ selected, onSelect, depth, children, badge }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={`flex w-full items-center gap-2 rounded-md py-1.5 pe-2 text-start text-sm ${
        selected ? 'bg-brand-600 font-semibold text-white' : 'text-slate-700 hover:bg-slate-100'
      }`}
      style={{ paddingInlineStart: `${0.5 + depth * 0.9}rem` }}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge && (
        <span
          className={`shrink-0 rounded px-1 text-[0.7rem] ${selected ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

/** Tombol naik/turun/duplikat/hapus untuk item yang sedang dipilih. */
function SelectedActions({ draft, path, setDraft, select }) {
  const { list, index, apply } = containerOf(draft, path)
  const key = path.step !== undefined ? 'step' : path.station !== undefined ? 'station' : 'part'
  const move = (delta) => {
    setDraft(apply(moveInList(list, index, delta)))
    select({ ...path, [key]: index + delta })
  }
  return (
    <div className="flex gap-1 px-2 pb-2" role="group" aria-label="Atur item terpilih">
      <IconButton label="Naikkan" icon={ArrowUp} disabled={index === 0} onClick={() => move(-1)} />
      <IconButton
        label="Turunkan"
        icon={ArrowDown}
        disabled={index === list.length - 1}
        onClick={() => move(1)}
      />
      <IconButton
        label="Duplikat"
        icon={CopyPlus}
        onClick={() => {
          setDraft(apply(duplicateInList(list, index)))
          select({ ...path, [key]: index + 1 })
        }}
      />
      <IconButton
        label="Hapus"
        icon={Trash2}
        tone="text-red-600"
        disabled={key === 'part' && list.length === 1}
        onClick={() => {
          if (
            !window.confirm(
              'Hapus item ini? Progres siswa pada langkah yang sudah terbit tetap tersimpan untuk laporan.',
            )
          )
            return
          setDraft(apply(removeFromList(list, index)))
          select(
            key === 'part'
              ? { part: 0 }
              : key === 'station'
                ? { part: path.part }
                : { part: path.part, station: path.station },
          )
        }}
      />
    </div>
  )
}

/** Daftar isi media di kiri Studio: bagian -> stasiun -> langkah (Belajar ulang & Tantangan). */
export default function Outline({ draft, setDraft, selected, select }) {
  const addStation = (partIndex, template) => {
    const part = draft.parts[partIndex]
    const station = newStation(template, `Stasiun ${part.stations.length + 1}`)
    const { apply } = containerOf(draft, { part: partIndex, station: 0 })
    setDraft(apply([...part.stations, station]))
    select({ part: partIndex, station: part.stations.length })
  }
  const addStep = (path, listId, kind) => {
    const station = draft.parts[path.part].stations[path.station]
    const { apply } = containerOf(draft, { ...path, list: listId, step: 0 })
    setDraft(apply([...station[listId], newStep(kind)]))
    select({ ...path, list: listId, step: station[listId].length })
  }

  return (
    <nav aria-label="Isi media" className="space-y-1">
      <Row selected={selected === 'media'} onSelect={() => select('media')} depth={0}>
        <span className="inline-flex items-center gap-1.5">
          <Settings2 className="size-4" aria-hidden="true" /> Maskot & glosarium
        </span>
      </Row>
      {draft.parts.map((part, p) => (
        <div key={part.id} className="space-y-0.5">
          <Row
            selected={samePath(selected, { part: p })}
            onSelect={() => select({ part: p })}
            depth={0}
            badge={`${part.stations.length} st`}
          >
            <b>Bagian {p + 1}:</b> {part.title || '(tanpa judul)'}
          </Row>
          {samePath(selected, { part: p }) && (
            <SelectedActions draft={draft} path={{ part: p }} setDraft={setDraft} select={select} />
          )}
          {part.stations.map((station, s) => {
            const stationPath = { part: p, station: s }
            const open = selected?.part === p && selected?.station === s
            return (
              <div key={station.id}>
                <Row
                  selected={samePath(selected, stationPath)}
                  onSelect={() => select(stationPath)}
                  depth={1}
                  badge={`${station.steps.length}`}
                >
                  {s + 1}. {station.title || '(tanpa judul)'}
                </Row>
                {samePath(selected, stationPath) && (
                  <SelectedActions
                    draft={draft}
                    path={stationPath}
                    setDraft={setDraft}
                    select={select}
                  />
                )}
                {open &&
                  LISTS.map(({ id, label }) => (
                    <div key={id} className="space-y-0.5 py-0.5">
                      {id !== 'steps' && (
                        <p className="ps-8 pt-1 text-[0.7rem] font-semibold tracking-wide text-slate-400 uppercase">
                          {label}
                        </p>
                      )}
                      {station[id].map((step, i) => {
                        const stepPath = { ...stationPath, list: id, step: i }
                        return (
                          <div key={step.id}>
                            <Row
                              selected={samePath(selected, stepPath)}
                              onSelect={() => select(stepPath)}
                              depth={2}
                              badge={GRADED.has(step.kind) ? 'latihan' : null}
                            >
                              {i + 1}. {step.title || stepDefinition(step.kind)?.label || step.kind}
                            </Row>
                            {samePath(selected, stepPath) && (
                              <SelectedActions
                                draft={draft}
                                path={stepPath}
                                setDraft={setDraft}
                                select={select}
                              />
                            )}
                          </div>
                        )
                      })}
                      <div className="ps-8 pe-2">
                        <KindSelect
                          label={`Tambah ${label.toLowerCase()}`}
                          placeholder={`+ ${label}…`}
                          onChange={(kind) => addStep(stationPath, id, kind)}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            )
          })}
          <div className="ps-4 pe-2">
            <select
              aria-label={`Tambah stasiun di bagian ${p + 1}`}
              value=""
              onChange={(event) => event.target.value && addStation(p, event.target.value)}
              className="block w-full rounded-md border-0 bg-white px-2 py-1.5 text-sm text-brand-700 ring-1 ring-brand-300 ring-inset"
            >
              <option value="">+ Stasiun dari template…</option>
              {Object.entries(STATION_TEMPLATES).map(([value, template]) => (
                <option key={value} value={value}>
                  {template.label} — {template.description}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          setDraft({
            ...draft,
            parts: [...draft.parts, newPart(`Bagian ${draft.parts.length + 1}`)],
          })
          select({ part: draft.parts.length })
        }}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold text-brand-700 ring-1 ring-brand-300 ring-dashed hover:bg-brand-50"
      >
        <Plus className="size-4" aria-hidden="true" /> Bagian baru
      </button>
    </nav>
  )
}
