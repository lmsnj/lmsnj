import { useState } from 'react'
import SelectField from '../../components/SelectField'
import TextAreaField from '../../components/TextAreaField'
import TextField from '../../components/TextField'
import { CheckField, ImageField, LinesField, ListEditor, NumberField, SmallInput } from './fields'
import { PLUGIN_FORMS } from './forms'
import { isSafeSimulationSrc, parseParams, SIM_MAX_HEIGHT, SIM_MIN_HEIGHT } from '../simulation'
import { SimulationStep } from '../steps/SimulationStep'

const SPEAKERS = [
  { value: 'mascot', label: 'Maskot' },
  { value: 'student', label: 'Siswa' },
  { value: 'narrator', label: 'Narator' },
]
const MOODS = [
  { value: '', label: 'Biasa' },
  { value: 'happy', label: 'Senang' },
  { value: 'think', label: 'Berpikir' },
  { value: 'oops', label: 'Ups' },
  { value: 'wow', label: 'Kagum' },
]
const FORMAT_HINT =
  'Format: **tebal**, *miring*, rumus $a^2$, tabel | a | b |. Sapaan: {nama_panggilan}, {nama_siswa}, {kelas}.'

function Area({ label, value, onChange, rows = 3, hint, placeholder }) {
  return (
    <TextAreaField
      label={label}
      value={value ?? ''}
      rows={rows}
      hint={hint}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function Text({ label, value, onChange, hint, placeholder, type = 'text' }) {
  return (
    <TextField
      label={label}
      type={type}
      value={value ?? ''}
      hint={hint}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

/** Pertanyaan + gambar + pembahasan (dipakai semua latihan). */
function QuestionFields({ step, set, mediaId, questionLabel = 'Pertanyaan' }) {
  return (
    <>
      <Area
        label={questionLabel}
        value={step.text}
        onChange={(text) => set({ text })}
        hint={FORMAT_HINT}
      />
      {step.kind !== 'hotspot' && (
        <ImageField value={step.image} onChange={(image) => set({ image })} mediaId={mediaId} />
      )}
    </>
  )
}

function Explanation({ step, set }) {
  return (
    <Area
      label="Pembahasan (tampil setelah siswa benar / membuka jawaban)"
      value={step.explanation}
      onChange={(explanation) => set({ explanation })}
      rows={2}
    />
  )
}

function Why({ step, set, label = 'Alasan jika salah (umpan balik “kenapa”)' }) {
  return <Area label={label} value={step.why} onChange={(why) => set({ why })} rows={2} />
}

const FORMS = {
  text: ({ step, set, mediaId }) => (
    <>
      <Area
        label="Isi penjelasan"
        value={step.body}
        onChange={(body) => set({ body })}
        rows={6}
        hint={FORMAT_HINT}
      />
      <ImageField value={step.image} onChange={(image) => set({ image })} mediaId={mediaId} />
      <Text
        label="Keterangan gambar"
        value={step.caption}
        onChange={(caption) => set({ caption })}
      />
    </>
  ),
  dialog: ({ step, set, mediaId }) => (
    <>
      <ListEditor
        label="Baris dialog"
        items={step.lines}
        min={1}
        onChange={(lines) => set({ lines })}
        newItem={() => ({ speaker: 'mascot', mood: '', text: '' })}
        addLabel="Tambah baris"
        renderItem={(line, update) => (
          <>
            <div className="grid grid-cols-2 gap-2">
              <SelectField
                value={line.speaker}
                options={SPEAKERS}
                aria-label="Pembicara"
                onChange={(e) => update({ speaker: e.target.value })}
              />
              <SelectField
                value={line.mood}
                options={MOODS}
                aria-label="Ekspresi"
                onChange={(e) => update({ mood: e.target.value })}
              />
            </div>
            <textarea
              aria-label="Teks dialog"
              rows={2}
              value={line.text}
              onChange={(e) => update({ text: e.target.value })}
              className="block w-full rounded-md border-0 px-2.5 py-1.5 text-base ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-brand-600 sm:text-sm"
            />
          </>
        )}
      />
      <ImageField
        label="Gambar pendukung (opsional)"
        value={step.image}
        onChange={(image) => set({ image })}
        mediaId={mediaId}
      />
    </>
  ),
  video: ({ step, set }) => (
    <>
      <Text
        label="Alamat video"
        type="url"
        value={step.url}
        onChange={(url) => set({ url })}
        placeholder="https://youtu.be/... atau Google Drive"
        hint="YouTube dan Google Drive diputar langsung."
      />
      <NumberField
        label="Mulai dari detik ke-"
        value={step.start}
        max={21600}
        onChange={(start) => set({ start })}
      />
      <Area
        label="Keterangan / tugas saat menonton"
        value={step.body}
        onChange={(body) => set({ body })}
        rows={2}
      />
    </>
  ),
  link: ({ step, set }) => (
    <>
      <Text
        label="Alamat tautan"
        type="url"
        value={step.url}
        onChange={(url) => set({ url })}
        placeholder="https://..."
        hint="Dibuka di tab baru, mis. artikel, simulasi daring, atau dokumen Drive."
      />
      <Text
        label="Teks tombol (opsional)"
        value={step.label}
        onChange={(label) => set({ label })}
        placeholder="Buka tautan"
      />
      <Area
        label="Keterangan / tugas"
        value={step.body}
        onChange={(body) => set({ body })}
        rows={2}
      />
    </>
  ),
  flip_cards: ({ step, set, mediaId }) => (
    <ListEditor
      label="Kartu"
      items={step.cards}
      min={1}
      onChange={(cards) => set({ cards })}
      newItem={() => ({ front: '', back: '', image: '' })}
      addLabel="Tambah kartu"
      renderItem={(card, update) => (
        <>
          <SmallInput
            label="Sisi depan"
            value={card.front}
            onChange={(front) => update({ front })}
          />
          <SmallInput
            label="Sisi belakang"
            value={card.back}
            onChange={(back) => update({ back })}
          />
          <ImageField
            label="Gambar sisi depan (opsional)"
            value={card.image}
            onChange={(image) => update({ image })}
            mediaId={mediaId}
          />
        </>
      )}
    />
  ),
  worked_example: ({ step, set }) => (
    <>
      <Area
        label="Soal contoh"
        value={step.body}
        onChange={(body) => set({ body })}
        rows={3}
        hint={FORMAT_HINT}
      />
      <ListEditor
        label="Langkah penyelesaian (dibuka satu per satu)"
        items={step.steps}
        min={1}
        max={15}
        onChange={(steps) => set({ steps })}
        newItem={() => ({ text: '', explain: '' })}
        addLabel="Tambah langkah"
        renderItem={(part, update) => (
          <>
            <SmallInput label="Langkah" value={part.text} onChange={(text) => update({ text })} />
            <SmallInput
              label="Kenapa langkah ini (opsional)"
              value={part.explain}
              onChange={(explain) => update({ explain })}
            />
          </>
        )}
      />
    </>
  ),
  choice: ({ step, set, mediaId }) => (
    <>
      <QuestionFields step={step} set={set} mediaId={mediaId} />
      <ListEditor
        label="Pilihan (tandai satu yang benar; isi alasan untuk pilihan salah)"
        items={step.choices}
        min={2}
        max={6}
        onChange={(choices) => {
          const correct = Math.min(step.correct, choices.length - 1)
          set({ choices, correct })
        }}
        newItem={() => ({ text: '', why: '' })}
        addLabel="Tambah pilihan"
        renderItem={(choice, update, index) => (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`benar-${step.id}`}
                checked={step.correct === index}
                onChange={() => set({ correct: index })}
                className="size-4"
              />
              <span
                className={
                  step.correct === index ? 'font-semibold text-brand-700' : 'text-slate-600'
                }
              >
                {step.correct === index ? 'Jawaban benar' : 'Jadikan jawaban benar'}
              </span>
            </label>
            <SmallInput
              label="Teks pilihan"
              value={choice.text}
              onChange={(text) => update({ text })}
            />
            {step.correct !== index && (
              <SmallInput
                label="Kenapa salah (ditampilkan ke siswa)"
                value={choice.why}
                onChange={(why) => update({ why })}
              />
            )}
          </>
        )}
      />
      <Explanation step={step} set={set} />
    </>
  ),
  true_false: ({ step, set, mediaId }) => (
    <>
      <QuestionFields step={step} set={set} mediaId={mediaId} questionLabel="Pernyataan" />
      <SelectField
        label="Kunci"
        value={step.answer ? 'true' : 'false'}
        options={[
          { value: 'true', label: 'Benar' },
          { value: 'false', label: 'Salah' },
        ]}
        onChange={(e) => set({ answer: e.target.value === 'true' })}
      />
      <Area
        label="Alasan jika siswa menjawab Benar (padahal salah)"
        value={step.why_true}
        onChange={(why_true) => set({ why_true })}
        rows={2}
      />
      <Area
        label="Alasan jika siswa menjawab Salah (padahal benar)"
        value={step.why_false}
        onChange={(why_false) => set({ why_false })}
        rows={2}
      />
      <Explanation step={step} set={set} />
    </>
  ),
  ordering: ({ step, set, mediaId }) => (
    <>
      <QuestionFields step={step} set={set} mediaId={mediaId} questionLabel="Perintah (opsional)" />
      <LinesField
        label="Butir dalam URUTAN BENAR (satu per baris; siswa melihatnya teracak)"
        value={step.items}
        onChange={(items) => set({ items })}
        rows={5}
      />
      <Why step={step} set={set} />
      <Explanation step={step} set={set} />
    </>
  ),
  categorize: ({ step, set, mediaId }) => (
    <>
      <QuestionFields step={step} set={set} mediaId={mediaId} questionLabel="Perintah (opsional)" />
      <LinesField
        label="Wadah (2-4, satu per baris)"
        value={step.categories}
        onChange={(categories) =>
          set({
            categories,
            items: step.items.map((item) => ({
              ...item,
              category: Math.min(item.category, Math.max(0, categories.length - 1)),
            })),
          })
        }
        rows={2}
      />
      <ListEditor
        label="Butir"
        items={step.items}
        min={2}
        max={12}
        onChange={(items) => set({ items })}
        newItem={() => ({ text: '', category: 0, why: '' })}
        addLabel="Tambah butir"
        renderItem={(item, update) => (
          <>
            <SmallInput
              label="Teks butir"
              value={item.text}
              onChange={(text) => update({ text })}
            />
            <SelectField
              aria-label="Wadah yang benar"
              value={String(item.category)}
              options={step.categories.map((label, i) => ({
                value: String(i),
                label: `Wadah: ${label}`,
              }))}
              onChange={(e) => update({ category: Number(e.target.value) })}
            />
            <SmallInput
              label="Kenapa (jika salah wadah)"
              value={item.why}
              onChange={(why) => update({ why })}
            />
          </>
        )}
      />
      <Explanation step={step} set={set} />
    </>
  ),
  hotspot: ({ step, set, mediaId }) => (
    <>
      <QuestionFields step={step} set={set} mediaId={mediaId} />
      <ImageField
        label="Gambar"
        value={step.image}
        onChange={(image) => set({ image })}
        mediaId={mediaId}
      />
      <CheckField
        label="Tampilkan nama bagian di gambar"
        checked={step.show_labels}
        onChange={(show_labels) => set({ show_labels })}
      />
      <ListEditor
        label="Bagian gambar (posisi & ukuran dalam persen lebar/tinggi gambar)"
        items={step.areas}
        min={2}
        max={12}
        onChange={(areas) => set({ areas })}
        newItem={() => ({ x: 40, y: 40, w: 20, h: 15, label: '', correct: false, why: '' })}
        addLabel="Tambah bagian"
        renderItem={(area, update) => (
          <>
            <div className="grid grid-cols-4 gap-2">
              {['x', 'y', 'w', 'h'].map((field) => (
                <label key={field} className="text-xs text-slate-600">
                  {{ x: 'Kiri %', y: 'Atas %', w: 'Lebar %', h: 'Tinggi %' }[field]}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={area[field]}
                    onChange={(e) => update({ [field]: Number(e.target.value) })}
                    className="mt-0.5 block w-full rounded-md border-0 px-2 py-1 text-base ring-1 ring-slate-300 sm:text-sm"
                  />
                </label>
              ))}
            </div>
            <SmallInput
              label="Nama bagian"
              value={area.label}
              onChange={(label) => update({ label })}
            />
            <CheckField
              label="Bagian ini jawaban benar"
              checked={area.correct}
              onChange={(correct) => update({ correct })}
            />
            {!area.correct && (
              <SmallInput
                label="Kenapa salah"
                value={area.why}
                onChange={(why) => update({ why })}
              />
            )}
          </>
        )}
      />
      <Explanation step={step} set={set} />
    </>
  ),
  fill_blank: ({ step, set, mediaId }) => (
    <>
      <QuestionFields step={step} set={set} mediaId={mediaId} questionLabel="Perintah (opsional)" />
      <Area
        label="Kalimat dengan isian [[jawaban]]"
        value={step.template}
        onChange={(template) => set({ template })}
        hint="Contoh: Hasil 7 % 3 adalah [[1]]. Jawaban lain yang juga benar dipisah |, mis. [[Jakarta|DKI Jakarta]]."
      />
      <CheckField
        label="Huruf besar/kecil diperhatikan"
        checked={step.case_sensitive}
        onChange={(case_sensitive) => set({ case_sensitive })}
      />
      <Why step={step} set={set} />
      <Explanation step={step} set={set} />
    </>
  ),
  drag_drop: ({ step, set, mediaId }) => (
    <>
      <QuestionFields step={step} set={set} mediaId={mediaId} questionLabel="Perintah (opsional)" />
      <Area
        label="Kalimat dengan tempat kosong [[jawaban]]"
        value={step.template}
        onChange={(template) => set({ template })}
        hint="Siswa menyeret/ketuk pilihan ke tempat kosong."
      />
      <LinesField
        label="Pengecoh (satu per baris)"
        value={step.distractors}
        onChange={(distractors) => set({ distractors })}
        rows={2}
      />
      <Why step={step} set={set} />
      <Explanation step={step} set={set} />
    </>
  ),
  matching: ({ step, set, mediaId }) => (
    <>
      <QuestionFields step={step} set={set} mediaId={mediaId} />
      <ListEditor
        label="Pasangan"
        items={step.pairs}
        min={2}
        max={10}
        onChange={(pairs) => set({ pairs })}
        newItem={() => ({ left: '', right: '' })}
        addLabel="Tambah pasangan"
        renderItem={(pair, update) => (
          <div className="grid grid-cols-2 gap-2">
            <SmallInput label="Kiri" value={pair.left} onChange={(left) => update({ left })} />
            <SmallInput label="Kanan" value={pair.right} onChange={(right) => update({ right })} />
          </div>
        )}
      />
      <LinesField
        label="Pengecoh di kanan (opsional, satu per baris)"
        value={step.distractors}
        onChange={(distractors) => set({ distractors })}
        rows={2}
      />
      <Why step={step} set={set} />
      <Explanation step={step} set={set} />
    </>
  ),
}
const EMBED_HINT =
  'Alamat https dari situs lain, mis. embed H5P.org (.../h5p/embed/123), GitHub Pages, atau Netlify. Konten dari ' +
  'alamat LMS ini ditolak demi keamanan.'

function EmbedFields({ step, set }) {
  return (
    <>
      <Text
        label="Alamat konten"
        type="url"
        value={step.url}
        onChange={(url) => set({ url })}
        hint={EMBED_HINT}
      />
      <NumberField
        label="Tinggi awal (piksel)"
        value={step.height}
        min={200}
        max={1200}
        onChange={(height) => set({ height })}
        hint="Konten H5P dan konten yang memakai bridge menyesuaikan tingginya sendiri."
      />
    </>
  )
}

FORMS.embed = ({ step, set }) => (
  <>
    <EmbedFields step={step} set={set} />
    <Area
      label="Keterangan / tugas"
      value={step.body}
      onChange={(body) => set({ body })}
      rows={2}
    />
  </>
)
FORMS.embed_task = ({ step, set, mediaId }) => (
  <>
    <QuestionFields step={step} set={set} mediaId={mediaId} questionLabel="Perintah" />
    <EmbedFields step={step} set={set} />
    <SelectField
      label="Cara menandai selesai"
      value={step.completion ?? 'manual'}
      onChange={(event) => set({ completion: event.target.value })}
      options={[
        {
          value: 'manual',
          label: 'Siswa mencentang "sudah selesai" (konten apa saja, mis. H5P.org)',
        },
        {
          value: 'bridge',
          label: 'Dilaporkan konten lewat bridge LMS Sigma (mpi:complete, boleh dengan skor)',
        },
      ]}
      hint="Laporan dari browser tidak bisa dibuktikan server: pakai untuk latihan, bukan ujian. Lihat docs/mpi-bridge.md."
    />
    {step.completion === 'bridge' && (
      <NumberField
        label="Skor minimal (%) — 0 = cukup selesai"
        value={step.min_score}
        min={0}
        max={100}
        onChange={(min_score) => set({ min_score })}
      />
    )}
    <Explanation step={step} set={set} />
  </>
)
/** Simulasi: file HTML di frontend/public/mpi/... (protokol mpi:*, lihat docs/mpi-simulasi.md). */
function SimulationFields({ step, set }) {
  const [paramsText, setParamsText] = useState(() => JSON.stringify(step.params ?? {}, null, 2))
  const [paramsError, setParamsError] = useState('')
  const [previewDone, setPreviewDone] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)
  const srcOk = isSafeSimulationSrc(step.src)
  const changeParams = (text) => {
    setParamsText(text)
    const parsed = parseParams(text)
    setParamsError(parsed.error ?? '')
    if (!parsed.error) set({ params: parsed.value })
  }
  return (
    <>
      <Area
        label="Teks instruksi"
        value={step.text}
        onChange={(text) => set({ text })}
        rows={2}
        hint={FORMAT_HINT}
      />
      <TextField
        label="Path file simulasi"
        value={step.src ?? ''}
        placeholder="/mpi/eksponen/sim/pangkat.html"
        onChange={(event) => set({ src: event.target.value })}
        error={
          step.src && !srcOk
            ? 'Harus file .html di folder aplikasi yang diawali /mpi/. Alamat luar tidak diizinkan.'
            : ''
        }
        hint="File diletakkan di frontend/public/mpi/... (ikut build & deploy aplikasi)."
      />
      <NumberField
        label="Tinggi awal (piksel)"
        value={step.height}
        min={SIM_MIN_HEIGHT}
        max={SIM_MAX_HEIGHT}
        onChange={(height) => set({ height })}
        hint="Simulasi bisa menyesuaikan tingginya sendiri lewat pesan mpi:resize."
      />
      <TextAreaField
        label="Params (JSON, dikirim ke simulasi lewat mpi:init)"
        value={paramsText}
        rows={3}
        error={paramsError}
        hint='Contoh: {"target": 81}. Kosongkan jika tidak perlu.'
        onChange={(event) => changeParams(event.target.value)}
      />
      <CheckField
        label="Wajib selesai: tombol Lanjut aktif setelah simulasi mengirim mpi:done"
        checked={step.require_done !== false}
        onChange={(require_done) => set({ require_done })}
      />
      <Area
        label="Penjelasan (tampil setelah selesai, opsional)"
        value={step.explanation}
        onChange={(explanation) => set({ explanation })}
        rows={2}
      />
      <div className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-700">Pratinjau langsung</p>
          <button
            type="button"
            className="text-sm font-semibold text-brand-700 hover:underline"
            onClick={() => {
              setPreviewDone(false)
              setPreviewKey((key) => key + 1)
            }}
          >
            Muat ulang pratinjau
          </button>
        </div>
        {srcOk ? (
          <SimulationStep
            key={`${step.src}-${previewKey}-${JSON.stringify(step.params ?? {})}`}
            step={step}
            done={previewDone}
            onSimulationDone={() => setPreviewDone(true)}
          />
        ) : (
          <p className="text-sm text-slate-500">
            Isi path file yang benar untuk melihat pratinjau.
          </p>
        )}
      </div>
    </>
  )
}

FORMS.simulation = SimulationFields
FORMS.did_you_know = FORMS.text
FORMS.flashcards = FORMS.flip_cards

/** Isian khusus jenis langkah. `set(perubahan)` menggabungkan ke langkah. */
export default function StepFields({ step, set, mediaId }) {
  const Form = FORMS[step.kind] ?? PLUGIN_FORMS[step.kind]
  if (!Form)
    return <p className="text-sm text-slate-500">Jenis “{step.kind}” diatur oleh plugin.</p>
  return <Form step={step} set={set} mediaId={mediaId} />
}
