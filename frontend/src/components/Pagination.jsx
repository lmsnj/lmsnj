import { PAGE_SIZE } from '../utils/constants'
import Button from './Button'

export default function Pagination({ page, count, pageSize = PAGE_SIZE, onChange }) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  if (count <= pageSize) return null

  return (
    <div className="flex items-center justify-between gap-2 text-sm text-slate-600">
      <span>
        Halaman {page} dari {totalPages} ({count} data)
      </span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Sebelumnya
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Berikutnya
        </Button>
      </div>
    </div>
  )
}
