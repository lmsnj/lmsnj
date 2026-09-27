import { useState } from 'react'
import { materialsApi } from '../../api/materials'
import Alert from '../../components/Alert'
import AssignmentSelect from '../../components/AssignmentSelect'
import MaterialList from '../../components/MaterialList'
import MaterialViewer from '../../components/MaterialViewer'
import PageHeader from '../../components/PageHeader'
import useFetch from '../../hooks/useFetch'
import { ALL } from '../../utils/academic'

// "Materi Pembelajaran" siswa: semua materi terbit dari semua mapel di kelasnya.
export default function StudentMaterialsPage() {
  const [assignment, setAssignment] = useState('')
  const [viewing, setViewing] = useState(null)
  const materials = useFetch(materialsApi.list, {
    ...ALL,
    teaching_assignment: assignment || undefined,
  })

  return (
    <>
      <PageHeader title="Materi Pembelajaran" description="Materi dari guru untuk kelas Anda." />
      <AssignmentSelect
        value={assignment}
        onChange={setAssignment}
        placeholder="Semua mata pelajaran"
        optionLabel={(a) => `${a.subject_name} (${a.teacher_name})`}
        className="mb-4 sm:max-w-sm"
        aria-label="Filter mata pelajaran"
      />
      <Alert type="error">{materials.error}</Alert>
      <MaterialList
        materials={materials.data?.results}
        loading={materials.loading}
        showContext={!assignment}
        emptyTitle="Belum ada materi."
        onOpen={setViewing}
      />
      <MaterialViewer material={viewing} onClose={() => setViewing(null)} />
    </>
  )
}
