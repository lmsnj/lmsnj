import GapTemplateField from './GapTemplateField'

// Rancangan soal isian singkat: { template, case_sensitive }.
export default function FillBlankFields({ spec, onChange, error, dir }) {
  return (
    <div className="space-y-3">
      <GapTemplateField
        value={spec.template ?? ''}
        onChange={(template) => onChange({ ...spec, template })}
        error={error}
        dir={dir}
        alternatives
      />
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={Boolean(spec.case_sensitive)}
          onChange={(event) => onChange({ ...spec, case_sensitive: event.target.checked })}
          className="size-4 rounded text-brand-600"
        />
        Peka huruf besar/kecil (mis. "html" dianggap salah jika kuncinya "HTML")
      </label>
      <p className="text-xs text-slate-500">
        Spasi berlebih selalu diabaikan saat penilaian. Tanpa centang di atas, huruf besar/kecil
        juga diabaikan.
      </p>
    </div>
  )
}
