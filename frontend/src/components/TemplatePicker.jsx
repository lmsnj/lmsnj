import { ChevronDown, Wand2 } from 'lucide-react'
import Dropdown, { DropdownItem } from './Dropdown'

/**
 * Tombol "Gunakan contoh" di form: memilih satu contoh isian lalu memanggil `onPick(values)`.
 * Daftar contoh ada di utils/formTemplates.js.
 */
export default function TemplatePicker({ templates, onPick }) {
  return (
    <Dropdown
      label="Gunakan contoh isian"
      align="left"
      width="w-60"
      buttonClassName="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-800 hover:bg-brand-100"
      button={({ open }) => (
        <>
          <Wand2 className="size-3.5" aria-hidden="true" />
          Gunakan contoh
          <ChevronDown
            className={`size-3.5 transition ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </>
      )}
    >
      {(close) =>
        templates.map((template) => (
          <DropdownItem
            key={template.label}
            onClick={() => {
              onPick(template.values)
              close()
            }}
          >
            {template.label}
          </DropdownItem>
        ))
      }
    </Dropdown>
  )
}
