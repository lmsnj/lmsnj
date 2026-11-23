import { useContext } from 'react'
import { SettingsContext } from '../context/settings-context'

/**
 * Apakah fitur baru menyala di sekolah aktif, mis. `useFeature('kuis_qr')`.
 * Selama belum dimuat / fitur mati = false, jadi tombol fitur baru tidak tampil dan
 * halaman lama tetap persis seperti sebelumnya.
 */
export default function useFeature(code) {
  return Boolean(useContext(SettingsContext)?.features?.[code])
}
