import { assignmentsApi } from '../../api/academics'
import { materialsApi } from '../../api/materials'
import { schoolSettingsApi } from '../../api/schoolSettings'

/**
 * Data halaman presentasi: materi + pengaturan yang berlaku untuk kelas-mapelnya. Halaman
 * presentasi ada di luar DashboardLayout (tanpa menu), jadi pengaturan dibaca sendiri di sini.
 * Materi milik rekan satu tim bisa tercatat di pengampu rekan itu; jika pengampunya tidak bisa
 * dibuka, pengaturan tingkat sekolah yang dipakai.
 */
export async function loadPresentation(materialId) {
  const material = await materialsApi.get(materialId)
  const assignment = await assignmentsApi.get(material.teaching_assignment).catch(() => null)
  const settings = await schoolSettingsApi.effective(
    assignment ? { subject: assignment.subject, classroom: assignment.classroom } : {},
  )
  return { material, settings }
}
