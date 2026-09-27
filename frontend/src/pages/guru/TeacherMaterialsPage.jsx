import { useState } from 'react'
import AssignmentSelect from '../../components/AssignmentSelect'
import PageHeader from '../../components/PageHeader'
import useQueryFlag from '../../hooks/useQueryFlag'
import MaterialsManager from './MaterialsManager'

// "Materi Pembelajaran": semua materi guru dari semua kelas yang ia ampu.
export default function TeacherMaterialsPage() {
  const openForm = useQueryFlag('baru') === '1'
  const [assignment, setAssignment] = useState('')

  return (
    <>
      <PageHeader
        title="Materi Pembelajaran"
        description="Semua materi di kelas yang Anda ampu. Materi berstatus Draf tidak terlihat oleh siswa."
      />
      <AssignmentSelect
        value={assignment}
        onChange={setAssignment}
        className="mb-4 sm:max-w-sm"
        aria-label="Filter kelas & mapel"
      />
      {/* key: daftar dimuat ulang saat filter berubah. */}
      <MaterialsManager
        key={assignment}
        assignmentId={assignment}
        showContext={!assignment}
        openForm={openForm && !assignment}
      />
    </>
  )
}
