import { useContext } from 'react'
import { SettingsContext } from '../context/settings-context'

/**
 * Nilai pengaturan pembelajaran yang berlaku di sekolah aktif (tingkat sekolah), mis.
 * `useSetting('nilai.kkm')`. `undefined` selama belum dimuat. Nilai per mapel/kelas dibaca
 * langsung dengan schoolSettingsApi.effective({ subject, classroom }).
 * Jangan menulis angka/label aturan langsung di komponen; daftar kunci ada di
 * backend/apps/school_settings/registry.py.
 */
export default function useSetting(key) {
  return useContext(SettingsContext)?.values?.[key]
}

/** Seluruh isi konteks: { values, features, reload }. */
export function useSchoolSettings() {
  return useContext(SettingsContext) ?? { values: {}, features: {}, reload: () => {} }
}
