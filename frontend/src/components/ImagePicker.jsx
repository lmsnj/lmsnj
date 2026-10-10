import { ImagePlus, X } from 'lucide-react'
import { useRef } from 'react'
import AuthImage from './AuthImage'
import Button from './Button'

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp'

/**
 * Tombol pilih/ganti/hapus gambar soal. `current` = gambar tersimpan ({ url }), `pending` = File baru
 * atau 'remove' (disimpan setelah soal tersimpan).
 */
export default function ImagePicker({ label, current, pending, onPick, onRemove }) {
  const input = useRef(null)
  const name = pending instanceof File ? pending.name : null
  const showCurrent = current && pending !== 'remove' && !name
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files[0]
          if (file) onPick(file)
          event.target.value = ''
        }}
      />
      <Button variant="ghost" size="sm" onClick={() => input.current?.click()} aria-label={label}>
        <ImagePlus className="size-4" aria-hidden="true" />
        {current || name ? 'Ganti gambar' : 'Gambar'}
      </Button>
      {showCurrent && <AuthImage url={current.url} alt={label} className="max-h-16" />}
      {name && <span className="rounded bg-sky-50 px-2 py-0.5 text-xs text-sky-800">🖼 {name}</span>}
      {(showCurrent || name) && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
          aria-label={`Hapus ${label.toLowerCase()}`}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
