// Fungsi murni untuk Pengaturan Pembelajaran & saklar fitur (lihat apps/school_settings di backend).

/** Teks ringkas satu nilai pengaturan, mis. "75", "Ya", "A ≥ 90, B ≥ 80", "Tugas 30%, Kuis 70%". */
export function formatSettingValue(setting, value) {
  if (value === null || value === undefined) return '-'
  switch (setting.kind) {
    case 'int':
      return setting.unit ? `${value} ${setting.unit}` : String(value)
    case 'bool':
      return value ? 'Ya' : 'Tidak'
    case 'choice':
      return optionLabel(setting, value)
    case 'multi':
      return value.map((item) => optionLabel(setting, item)).join(', ')
    case 'bands':
      return value.map((band) => `${band.label} ≥ ${band.min}`).join(', ')
    case 'weights':
      return value.map((item) => `${item.label} ${item.weight}%`).join(', ')
    case 'fields':
      return (setting.fields ?? [])
        .map((field) => `${field.label} ${value[field.name]}${field.unit ? ` ${field.unit}` : ''}`)
        .join(', ')
    default:
      return JSON.stringify(value)
  }
}

function optionLabel(setting, value) {
  return setting.options?.find((option) => option.value === value)?.label ?? String(value)
}

const SOURCE_LABELS = {
  default: 'Bawaan sistem',
  school: 'Pengaturan sekolah',
  category: 'Pengaturan kategori mapel',
  subject: 'Pengaturan mapel',
  classroom: 'Pengaturan kelas',
}

/** Asal nilai yang berlaku. `scope` = cakupan yang sedang dibuka di halaman. */
export function sourceLabel(source, scope) {
  if (source === scope) return 'Diubah di sini'
  return SOURCE_LABELS[source] ?? source
}

/** Sama persis (dipakai untuk menonaktifkan tombol Simpan jika tidak ada perubahan). */
export function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Jumlah bobot (isian jenis weights). */
export function totalWeight(items) {
  return (items ?? []).reduce((sum, item) => sum + (Number(item.weight) || 0), 0)
}

/**
 * Menu tanpa item yang fiturnya mati. Item menu boleh diberi `feature: '<kode>'`
 * (lihat layouts/navigation.js); item tanpa `feature` selalu tampil.
 */
export function filterNavByFeatures(nav, features) {
  const visible = (item) => !item.feature || Boolean(features?.[item.feature])
  return { ...nav, main: nav.main.filter(visible), more: (nav.more ?? []).filter(visible) }
}

/** Teks nilai di Riwayat (tanpa definisi pengaturan). null = memakai bawaan. */
export function formatHistoryValue(value) {
  if (value === null || value === undefined) return 'Bawaan'
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak'
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item !== 'object' || item === null) return String(item)
        if ('weight' in item) return `${item.label} ${item.weight}%`
        if ('min' in item) return `${item.label} ≥ ${item.min}`
        return JSON.stringify(item)
      })
      .join(', ')
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([name, item]) => `${name}: ${item}`)
      .join(', ')
  }
  return String(value)
}
