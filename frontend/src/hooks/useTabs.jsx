import { useSearchParams } from 'react-router-dom'

/**
 * Tab yang tersimpan di URL (?tab=...), jadi tetap sama saat halaman di-reload.
 *
 * const [tab, tabsBar, selectTab] = useTabs([{ id: 'materi', label: 'Materi' }, ...])
 * `onSelect(id)` (opsional) dipanggil setiap kali tab dipilih.
 */
export function useTabs(tabs, onSelect) {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const active = tabs.some((tab) => tab.id === requested) ? requested : tabs[0].id
  const select = (id) => {
    onSelect?.(id)
    setSearchParams({ tab: id }, { replace: true })
  }

  const bar = (
    <div
      className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 sm:gap-3"
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => select(tab.id)}
          className={`relative shrink-0 px-3 py-3 text-sm font-semibold transition sm:text-base ${
            active === tab.id
              ? 'text-slate-900 after:absolute after:inset-x-1 after:bottom-0 after:h-[3px] after:rounded-full after:bg-brand-600'
              : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )

  return [active, bar, select]
}
