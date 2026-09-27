import { useMemo, useState } from 'react'
import { assignmentsApi } from '../../api/academics'
import MaterialExplorer, { FilterSummary } from '../../components/MaterialExplorer'
import useFetch from '../../hooks/useFetch'
import useQueryFlag from '../../hooks/useQueryFlag'
import { ALL } from '../../utils/academic'
import { countBy, filterMaterials } from '../../utils/materialFilters'
import MaterialsManager from './MaterialsManager'

const EMPTY_FILTERS = { search: '', assignment: '', type: '' }
const assignmentLabel = (a) => `${a.subject_name} · ${a.classroom_name}`

const scrollToResults = () =>
  document.getElementById('daftar-materi')?.scrollIntoView({ behavior: 'smooth' })

// "Materi Pembelajaran" guru: semua materi dari semua kelas yang ia ampu, disaring di browser.
export default function TeacherMaterialsPage() {
  const openForm = useQueryFlag('baru') === '1'
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const assignments = useFetch(assignmentsApi.list, ALL)
  const filter = useMemo(() => (materials) => filterMaterials(materials, filters), [filters])

  return (
    <MaterialsManager
      assignmentId=""
      showContext
      openForm={openForm}
      filter={filter}
      header={(all) => (
        <div className="mb-8">
          <MaterialExplorer
            description="Kelola materi untuk semua kelas yang Anda ampu. Materi berstatus Draf tidak terlihat oleh siswa."
            total={all.length}
            assignments={assignments.data?.results}
            subjectCounts={countBy(all, 'teaching_assignment')}
            typeCounts={countBy(all, 'material_type')}
            filters={filters}
            onChange={setFilters}
            assignmentSublabel={(a) => a.classroom_name}
            onSearchSubmit={scrollToResults}
          />
        </div>
      )}
      summary={(count) => (
        <div id="daftar-materi" className="scroll-mt-4">
          <FilterSummary
            filters={filters}
            onChange={setFilters}
            assignments={assignments.data?.results}
            count={count}
            assignmentLabel={assignmentLabel}
            className=""
          />
        </div>
      )}
    />
  )
}
