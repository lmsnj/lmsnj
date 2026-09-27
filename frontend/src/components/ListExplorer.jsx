import {
  countByAssignment,
  countStatuses,
  EMPTY_FILTERS,
  filterChips,
  filterList,
} from '../utils/listFilters'
import { FilterChips, OptionPanel, SubjectPanel } from './ExplorePanels'
import PageHero from './PageHero'

const scrollToResults = () =>
  document.getElementById('daftar-hasil')?.scrollIntoView({ behavior: 'smooth' })

/**
 * Kerangka halaman daftar bergaya halaman Materi: banner + pencarian, panel "Pilihan Mata
 * Pelajaran", panel status, lalu hasil. Penyaringan dilakukan di browser (utils/listFilters.js).
 * - `hero`: props PageHero (title, description, icons, centerIcon, stats, actions)
 * - `items`: semua data; `textOf(item)`: teks yang dicari
 * - `statuses`: [{ id, title, description, icon, tile, match(item) }]
 * - `filters` / `onChange`: { search, assignment, status }
 * - `children(shown)`: tampilan daftar hasil
 */
export default function ListExplorer({
  hero,
  searchPlaceholder,
  items,
  textOf,
  assignments,
  assignmentLabel = (a) => a.subject_name,
  assignmentSublabel,
  unit,
  statuses,
  statusTitle,
  filters,
  onChange,
  children,
}) {
  const set = (changes) => onChange({ ...filters, ...changes })
  const shown = filterList(items, filters, { textOf, statuses })
  const chips = filterChips(filters, {
    assignments,
    assignmentLabel: (a) =>
      assignmentSublabel ? `${assignmentLabel(a)} · ${assignmentSublabel(a)}` : assignmentLabel(a),
    options: statuses,
  })

  return (
    <>
      <div className="space-y-6">
        <PageHero
          {...hero}
          search={{
            value: filters.search,
            onChange: (search) => set({ search }),
            onSubmit: scrollToResults,
            placeholder: searchPlaceholder,
          }}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <SubjectPanel
            assignments={assignments}
            counts={countByAssignment(items)}
            unit={unit}
            selected={filters.assignment}
            onSelect={(assignment) => set({ assignment })}
            label={assignmentLabel}
            sublabel={assignmentSublabel}
          />
          <OptionPanel
            title={statusTitle}
            options={statuses}
            counts={countStatuses(items, statuses)}
            selected={filters.status}
            onSelect={(status) => set({ status })}
            resetLabel="Semua"
          />
        </div>
      </div>

      <section id="daftar-hasil" className="mt-8 scroll-mt-4">
        <FilterChips
          count={shown.length}
          chips={chips}
          onRemove={(key) => set({ [key]: '' })}
          onClear={() => onChange(EMPTY_FILTERS)}
        />
        {children(shown)}
      </section>
    </>
  )
}
