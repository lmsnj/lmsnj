import { useState } from 'react'
import { assignmentsApi } from '../../api/academics'
import { materialsApi } from '../../api/materials'
import Alert from '../../components/Alert'
import MaterialExplorer, { FilterSummary } from '../../components/MaterialExplorer'
import MaterialList from '../../components/MaterialList'
import MaterialViewer from '../../components/MaterialViewer'
import useFetch from '../../hooks/useFetch'
import { ALL } from '../../utils/academic'
import { countBy, filterMaterials } from '../../utils/materialFilters'

const EMPTY_FILTERS = { search: '', assignment: '', type: '' }

const scrollToResults = () =>
  document.getElementById('daftar-materi')?.scrollIntoView({ behavior: 'smooth' })

// "Materi Pembelajaran" siswa: semua materi terbit dari semua mapel di kelasnya, disaring di browser.
export default function StudentMaterialsPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [viewing, setViewing] = useState(null)
  const materials = useFetch(materialsApi.list, ALL)
  const assignments = useFetch(assignmentsApi.list, ALL)
  const all = materials.data?.results ?? []
  const shown = filterMaterials(all, filters)
  const classroom = assignments.data?.results?.[0]?.classroom_name

  return (
    <>
      <MaterialExplorer
        description={`Belajar kapan saja dari materi yang dibagikan guru${
          classroom ? ` untuk kelas ${classroom}` : ''
        }.`}
        total={all.length}
        assignments={assignments.data?.results}
        subjectCounts={countBy(all, 'teaching_assignment')}
        typeCounts={countBy(all, 'material_type')}
        filters={filters}
        onChange={setFilters}
        assignmentSublabel={(a) => a.teacher_name}
        onSearchSubmit={scrollToResults}
      />

      <section id="daftar-materi" className="mt-8 scroll-mt-4">
        <FilterSummary
          filters={filters}
          onChange={setFilters}
          assignments={assignments.data?.results}
          count={shown.length}
          assignmentLabel={(a) => a.subject_name}
        />
        <Alert type="error" className="mb-3">
          {materials.error || assignments.error}
        </Alert>
        <MaterialList
          materials={shown}
          loading={materials.loading}
          showContext={!filters.assignment}
          emptyTitle={all.length ? 'Tidak ada materi yang cocok.' : 'Belum ada materi.'}
          emptyMessage={
            all.length
              ? 'Coba kata kunci lain atau hapus penyaring.'
              : 'Materi dari guru akan muncul di sini.'
          }
          onOpen={setViewing}
        />
      </section>
      <MaterialViewer material={viewing} onClose={() => setViewing(null)} />
    </>
  )
}
