import { useCallback, useState } from 'react'
import useClickOutside from '../hooks/useClickOutside'

/**
 * Menu dropdown sederhana.
 *
 * <Dropdown button={({ open }) => <>Menu</>} label="Menu pengguna">
 *   {(close) => <DropdownItem onClick={close}>...</DropdownItem>}
 * </Dropdown>
 */
export default function Dropdown({
  button,
  label,
  align = 'right',
  width = 'w-56',
  buttonClassName = '',
  onOpen,
  children,
}) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useClickOutside(open, close)

  const toggle = () => {
    if (!open) onOpen?.()
    setOpen(!open)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={toggle}
        className={buttonClassName}
      >
        {button({ open })}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute z-40 mt-2 ${width} ${
            align === 'right' ? 'right-0' : 'left-0'
          } overflow-hidden rounded-xl bg-white py-1 text-sm text-slate-700 shadow-lg ring-1 ring-slate-200`}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}

const itemClass = 'flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50'

// Satu baris menu. `soon` = fitur belum tersedia (nonaktif dengan label "Segera").
export function DropdownItem({ icon: Icon, children, soon, className = '', as: As, ...props }) {
  const content = (
    <>
      {Icon && <Icon className="size-4 shrink-0 text-slate-400" aria-hidden="true" />}
      <span className="flex-1">{children}</span>
      {soon && <SoonBadge />}
    </>
  )
  if (soon) {
    return (
      <span
        role="menuitem"
        aria-disabled="true"
        title="Segera hadir"
        className={`${itemClass} cursor-not-allowed text-slate-400 hover:bg-transparent`}
      >
        {content}
      </span>
    )
  }
  const Component = As ?? 'button'
  return (
    <Component
      role="menuitem"
      className={`${itemClass} ${className}`}
      {...(Component === 'button' ? { type: 'button' } : {})}
      {...props}
    >
      {content}
    </Component>
  )
}

export function SoonBadge({ light }) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
        light ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
      }`}
    >
      Segera
    </span>
  )
}
