import SelectField from '../../../components/SelectField'
import TextAreaField from '../../../components/TextAreaField'
import { ImageField, NumberField } from '../../studio/fields'
import { APERTURES, ISOS, SHUTTERS, shutterLabel } from './exposure'

const options = (list, format, empty) => [
  ...(empty ? [{ value: '', label: empty }] : []),
  ...list.map((value) => ({ value: String(value), label: format(value) })),
]
const fNumber = (v) => `f/${v}`
const shutter = (v) => `${shutterLabel(v)} detik`
const iso = (v) => `ISO ${v}`

/** Form Studio plugin DKV: simulator exposure. */
export function ExposureFields({ step, set, mediaId }) {
  const target = step.target ?? {}
  const rules = step.rules ?? {}
  const setTarget = (changes) => set({ target: { ...target, ...changes } })
  const setRule = (name, value) =>
    set({ rules: { ...rules, [name]: value === '' ? null : Number(value) } })
  return (
    <>
      <TextAreaField
        label="Situasi foto / perintah"
        value={step.text ?? ''}
        rows={3}
        hint="Tulis syarat kreatifnya di sini juga, mis. 'pelari harus terlihat beku'."
        onChange={(event) => set({ text: event.target.value })}
      />
      <ImageField
        label="Foto contoh (opsional)"
        value={step.image}
        onChange={(image) => set({ image })}
        mediaId={mediaId}
      />
      <fieldset className="grid gap-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">Pengaturan acuan (exposure tepat)</legend>
        <SelectField
          label="Bukaan"
          value={String(target.aperture ?? '')}
          options={options(APERTURES, fNumber)}
          onChange={(e) => setTarget({ aperture: Number(e.target.value) })}
        />
        <SelectField
          label="Shutter"
          value={String(target.shutter ?? '')}
          options={options(SHUTTERS, shutter)}
          onChange={(e) => setTarget({ shutter: Number(e.target.value) })}
        />
        <SelectField
          label="ISO"
          value={String(target.iso ?? '')}
          options={options(ISOS, iso)}
          onChange={(e) => setTarget({ iso: Number(e.target.value) })}
        />
      </fieldset>
      <fieldset className="grid gap-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">
          Syarat kreatif (opsional, tidak terlihat siswa)
        </legend>
        <SelectField
          label="Shutter paling lambat (objek bergerak)"
          value={String(rules.slowest_shutter ?? '')}
          options={options(SHUTTERS, shutter, '- Tidak ada -')}
          onChange={(e) => setRule('slowest_shutter', e.target.value)}
        />
        <SelectField
          label="ISO paling tinggi (noise)"
          value={String(rules.max_iso ?? '')}
          options={options(ISOS, iso, '- Tidak ada -')}
          onChange={(e) => setRule('max_iso', e.target.value)}
        />
        <SelectField
          label="Angka f paling besar (latar blur)"
          value={String(rules.max_aperture ?? '')}
          options={options(APERTURES, fNumber, '- Tidak ada -')}
          onChange={(e) => setRule('max_aperture', e.target.value)}
        />
        <SelectField
          label="Angka f paling kecil (semua tajam)"
          value={String(rules.min_aperture ?? '')}
          options={options(APERTURES, fNumber, '- Tidak ada -')}
          onChange={(e) => setRule('min_aperture', e.target.value)}
        />
      </fieldset>
      <NumberField
        label="Toleransi terang/gelap (stop)"
        value={step.tolerance ?? 0.5}
        min={0.3}
        max={2}
        onChange={(tolerance) => set({ tolerance })}
      />
      <TextAreaField
        label="Pembahasan (tampil setelah siswa benar / membuka jawaban)"
        value={step.explanation ?? ''}
        rows={2}
        onChange={(event) => set({ explanation: event.target.value })}
      />
    </>
  )
}
