import Spinner from './Spinner'

/**
 * Tabel sederhana dengan state loading & kosong.
 *
 * columns: [{ header: 'Nama', cell: (row) => row.name, className: 'text-right' }]
 */
export default function DataTable({
  columns,
  rows,
  loading,
  emptyMessage = 'Belum ada data.',
  rowKey = (row) => row.id,
}) {
  let body
  if (loading && !rows?.length) {
    body = (
      <tr>
        <td colSpan={columns.length} className="px-4 py-10 text-center text-brand-600">
          <Spinner />
        </td>
      </tr>
    )
  } else if (!rows?.length) {
    body = (
      <tr>
        <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">
          {emptyMessage}
        </td>
      </tr>
    )
  } else {
    body = rows.map((row) => (
      <tr key={rowKey(row)} className="hover:bg-slate-50">
        {columns.map((column) => (
          <td key={column.header} className={`px-4 py-3 ${column.className ?? ''}`}>
            {column.cell(row)}
          </td>
        ))}
      </tr>
    ))
  }

  return (
    <div className="relative overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      {/* Garis tipis penanda sedang memuat ulang, data lama tetap tampil. */}
      {loading && rows?.length > 0 && (
        <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-brand-600" />
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              {columns.map((column) => (
                <th key={column.header} className={`px-4 py-3 ${column.className ?? ''}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">{body}</tbody>
        </table>
      </div>
    </div>
  )
}
