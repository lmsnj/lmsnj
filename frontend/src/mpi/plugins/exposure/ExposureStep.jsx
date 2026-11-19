import { Aperture, Gauge, Timer } from 'lucide-react'
import { Rich, StepImage } from '../../steps/ExplainSteps'
import { meter, middleSetting, shutterLabel } from './exposure'

function Slider({ icon: Icon, label, options, value, format, onChange }) {
  const index = Math.max(
    0,
    options.findIndex((option) => Math.abs(option - value) < 1e-9),
  )
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between text-[0.9em] font-semibold text-slate-700">
        <span className="flex items-center gap-1.5">
          <Icon className="size-4" aria-hidden="true" /> {label}
        </span>
        <span className="font-mono text-brand-800">{format(options[index])}</span>
      </span>
      <input
        type="range"
        min="0"
        max={options.length - 1}
        step="1"
        value={index}
        disabled={!onChange}
        aria-valuetext={format(options[index])}
        onChange={(event) => onChange(options[Number(event.target.value)])}
        className="w-full accent-brand-600"
      />
    </label>
  )
}

/**
 * Simulator exposure (plugin DKV). Nilai = { aperture, shutter, iso }. Pratinjau foto & light meter dihitung
 * di browser; kecocokan syarat kreatif (objek bergerak, latar blur, noise) dinilai di server.
 */
export function ExposureStep({ step, user, value, onChange, review }) {
  const setting = value ?? middleSetting(step)
  const { difference, brightness, label } = meter(step, setting)
  const set = onChange ? (changes) => onChange({ ...setting, ...changes }) : null
  const needle = Math.min(100, Math.max(0, ((difference + 3) / 6) * 100))
  const band = (step.tolerance / 6) * 100
  const target = review?.key?.setting
  return (
    <div className="space-y-4">
      <Rich text={step.text} user={user} />
      <div className="overflow-hidden rounded-lg bg-slate-900">
        {step.image ? (
          <div
            style={{ filter: `brightness(${brightness})` }}
            className="transition-[filter] motion-reduce:transition-none"
          >
            <StepImage src={step.image} className="mx-auto max-h-72" />
          </div>
        ) : (
          <div
            className="h-40 bg-gradient-to-br from-sky-300 via-amber-200 to-emerald-400"
            style={{ filter: `brightness(${brightness})` }}
            aria-hidden="true"
          />
        )}
      </div>
      <div>
        <p className="mb-1 flex items-center justify-between text-[0.85em] font-semibold">
          <span>Light meter</span>
          <span className={label === 'Pas' ? 'text-brand-700' : 'text-amber-700'}>{label}</span>
        </p>
        <div className="relative h-3 rounded-full bg-gradient-to-r from-slate-800 via-slate-300 to-yellow-200">
          <div
            className="absolute inset-y-0 rounded-full bg-brand-500/40"
            style={{ left: `${50 - band}%`, width: `${band * 2}%` }}
          />
          <div
            className="absolute -top-1 h-5 w-1 rounded bg-red-600"
            style={{ left: `calc(${needle}% - 2px)` }}
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[0.75em] text-slate-500">
          <span>−3 gelap</span>
          <span>0</span>
          <span>+3 terang</span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Slider
          icon={Aperture}
          label="Bukaan"
          options={step.apertures}
          value={setting.aperture}
          format={(v) => `f/${v}`}
          onChange={set && ((aperture) => set({ aperture }))}
        />
        <Slider
          icon={Timer}
          label="Shutter"
          options={step.shutters}
          value={setting.shutter}
          format={(v) => `${shutterLabel(v)} s`}
          onChange={set && ((shutter) => set({ shutter }))}
        />
        <Slider
          icon={Gauge}
          label="ISO"
          options={step.isos}
          value={setting.iso}
          format={(v) => `ISO ${v}`}
          onChange={set && ((iso) => set({ iso }))}
        />
      </div>
      <p className="text-[0.8em] text-slate-500">
        Angka f kecil = bukaan lebar (latar blur, lebih terang). Shutter cepat membekukan gerak
        tetapi lebih gelap. ISO tinggi lebih terang tetapi berbintik.
      </p>
      {target && (
        <p className="rounded-lg bg-brand-50 p-2 text-[0.9em] ring-1 ring-brand-200">
          Contoh pengaturan yang tepat: f/{target.aperture}, {shutterLabel(target.shutter)} s, ISO{' '}
          {target.iso}.
        </p>
      )}
    </div>
  )
}
