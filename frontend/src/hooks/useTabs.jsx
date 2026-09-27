import { useSearchParams } from 'react-router-dom'

/**
 * Tab yang tersimpan di URL (?tab=...), jadi tetap sama saat halaman di-reload.
 *
 * const [tab, tabsBar] = useTabs([{ id: 'materi', label: 'Materi' }, ...])
 */
export function useTabs(tabs) {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const active = tabs.some((tab) => tab.id === requested) ? requested : tabs[0].id

  const bar = (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => setSearchParams({ tab: tab.id }, { replace: true })}
          className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${
            active === tab.id
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )

  return [active, bar]
}
