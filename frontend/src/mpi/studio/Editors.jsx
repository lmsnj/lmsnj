import TextAreaField from '../../components/TextAreaField'
import TextField from '../../components/TextField'
import { stepDefinition } from '../registry'
import { newStep } from '../studio'
import { CheckField, ImageField, LinesField, ListEditor, NumberField, SmallInput } from './fields'
import { KindSelect } from './Outline'
import StepFields from './StepFields'

function Heading({ children, note }) {
  return (
    <div className="border-b border-slate-200 pb-2">
      <h2 className="text-lg font-bold text-slate-900">{children}</h2>
      {note && <p className="text-xs text-slate-500">{note}</p>}
    </div>
  )
}

export function MediaSettingsEditor({ draft, onChange, mediaId }) {
  const mascot = draft.mascot ?? { name: '', image: '' }
  return (
    <div className="space-y-4">
      <Heading note="Maskot menemani siswa di langkah dialog. Glosarium bisa dibuka siswa kapan saja.">
        Maskot & glosarium
      </Heading>
      <TextField
        label="Nama maskot"
        value={mascot.name}
        maxLength={40}
        onChange={(event) => onChange({ mascot: { ...mascot, name: event.target.value } })}
      />
      <ImageField
        label="Gambar maskot (kosong = robot bawaan)"
        value={mascot.image}
        mediaId={mediaId}
        onChange={(image) => onChange({ mascot: { ...mascot, image } })}
      />
      <ListEditor
        label={`Glosarium (${draft.glossary.length} istilah)`}
        items={draft.glossary}
        max={300}
        onChange={(glossary) => onChange({ glossary })}
        newItem={() => ({ term: '', meaning: '' })}
        addLabel="Tambah istilah"
        renderItem={(entry, update) => (
          <>
            <SmallInput label="Istilah" value={entry.term} onChange={(term) => update({ term })} />
            <SmallInput
              label="Arti (bahasa sederhana)"
              value={entry.meaning}
              onChange={(meaning) => update({ meaning })}
            />
          </>
        )}
      />
    </div>
  )
}

export function PartEditor({ part, number, onChange }) {
  return (
    <div className="space-y-4">
      <Heading>Bagian {number}</Heading>
      <TextField
        label="Judul bagian"
        value={part.title}
        onChange={(e) => onChange({ title: e.target.value })}
        required
      />
      <TextAreaField
        label="Deskripsi (opsional)"
        value={part.description}
        rows={2}
        onChange={(e) => onChange({ description: e.target.value })}
      />
    </div>
  )
}

export function StationEditor({ station, number, earlier, onChange }) {
  return (
    <div className="space-y-4">
      <Heading note="Tambahkan langkah lewat daftar di kiri (“+ Langkah…”).">
        Stasiun {number}
      </Heading>
      <TextField
        label="Judul stasiun"
        value={station.title}
        onChange={(e) => onChange({ title: e.target.value })}
        required
      />
      <LinesField
        label="Tujuan pembelajaran (“Setelah ini kamu bisa…”, satu per baris, maks. 8)"
        value={station.objectives}
        onChange={(objectives) => onChange({ objectives })}
        placeholder="Menjelaskan arti algoritma"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Perkiraan durasi (menit)"
          value={station.minutes}
          max={240}
          onChange={(minutes) => onChange({ minutes })}
        />
        <TextField
          label="Nama lencana (opsional)"
          value={station.badge?.title ?? ''}
          maxLength={60}
          placeholder="mis. Juru Resep"
          onChange={(e) =>
            onChange({ badge: e.target.value ? { title: e.target.value, icon: 'award' } : null })
          }
        />
      </div>
      <CheckField
        label="Stasiun opsional (tidak wajib untuk menuntaskan media dan tidak mengunci stasiun berikutnya)"
        checked={station.optional}
        onChange={(optional) => onChange({ optional })}
      />
      {earlier.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="mb-1 text-sm font-medium text-slate-700">
            Prasyarat tambahan (selain urutan)
          </legend>
          {earlier.map((item) => (
            <CheckField
              key={item.id}
              label={item.title}
              checked={station.prerequisites.includes(item.id)}
              onChange={(checked) =>
                onChange({
                  prerequisites: checked
                    ? [...station.prerequisites, item.id]
                    : station.prerequisites.filter((id) => id !== item.id),
                })
              }
            />
          ))}
        </fieldset>
      )}
      <LinesField
        label="Ringkasan di akhir stasiun (3 poin inti, satu per baris, maks. 5)"
        value={station.summary}
        onChange={(summary) => onChange({ summary })}
      />
      <TextField
        label="Pertanyaan refleksi"
        value={station.reflection}
        onChange={(e) => onChange({ reflection: e.target.value })}
        hint="Kosongkan jika tidak perlu refleksi."
      />
    </div>
  )
}

export function StepEditor({ step, listLabel, number, onChange, onReplace, mediaId }) {
  const definition = stepDefinition(step.kind)
  return (
    <div className="space-y-4">
      <Heading note={`${listLabel} ${number}`}>{definition?.label ?? step.kind}</Heading>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Judul langkah (opsional)"
          value={step.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Ganti jenis langkah</span>
          <KindSelect
            label="Ganti jenis langkah"
            value={step.kind}
            placeholder={null}
            onChange={(kind) => {
              if (kind === step.kind) return
              if (
                !window.confirm(
                  'Ganti jenis? Isi langkah ini diganti contoh jenis baru (judul & petunjuk tetap).',
                )
              )
                return
              onReplace({ ...newStep(kind), id: step.id, title: step.title, hints: step.hints })
            }}
          />
        </div>
      </div>
      <StepFields key={step.id} step={step} set={onChange} mediaId={mediaId} />
      {definition && step.kind !== 'text' && (
        <LinesField
          key={`hints-${step.id}`}
          label="Petunjuk bertahap (maks. 3, satu per baris; dibuka siswa satu per satu)"
          value={step.hints}
          onChange={(hints) => onChange({ hints: hints.slice(0, 3) })}
          rows={2}
        />
      )}
    </div>
  )
}
