import { GRADES } from '../utils/academic'
import useAuth from './useAuth'

/**
 * Tingkat kelas sekolah yang sedang dibuka, urut dari terendah (SD/MI I–VI, SMP/MTs VII–IX,
 * SMA/MA/SMK X–XII). `first` = tingkat siswa baru, `last` = tingkat yang lulus.
 */
export default function useGrades() {
  const { school } = useAuth()
  const grades = school?.grades ?? GRADES
  return { grades, first: grades[0], last: grades[grades.length - 1] }
}
