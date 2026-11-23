import { ChartColumn, Table } from 'lucide-react'
import { useState } from 'react'

/**
 * Kartu pembungkus satu grafik + tombol "Tabel" untuk melihat angka yang sama dalam tabel
 * (pembaca layar, cetak, atau pengguna yang lebih nyaman membaca angka).
 * - `table`: { columns: ['Kelas', 'Siswa'], rows: [['XI RPL 1', '32'], ...] }
 * - `empty`: teks jika belum ada data (grafik & tabel tidak ditampilkan)
 */
export default function ChartCard({ title, description, icon: Icon, table, empty, children }) {
  const [showTable, setShowTable] = useState(false)
  return (
    <section className="flex flex-col rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Icon className="size-5" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900">{title}</h2>
            {description && <p className="text-sm text-slate-500">{description}</p>}
          </div>
        </div>
        {!empty && (
          <button
            type="button"
            onClick={() => setShowTable((value) => !value)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            aria-pressed={showTable}
          >
            {showTable ? (
              <ChartColumn className="size-4" aria-hidden="true" />
            ) : (
              <Table className="size-4" aria-hidden="true" />
            )}
            {showTable ? 'Grafik' : 'Tabel'}
          </button>
        )}
      </div>

      {empty ? (
        <p className="flex flex-1 items-center justify-center rounded-lg bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
          {empty}
        </p>
      ) : showTable ? (
        <div className="max-h-80 overflow-auto rounded-lg ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-slate-600">
              <tr>
                {table.columns.map((column, index) => (
                  <th key={column} className={`px-3 py-2 font-medium ${index ? 'text-right' : ''}`}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {table.rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, index) => (
                    <td
                      key={index}
                      className={`px-3 py-2 ${index ? 'text-right tabular-nums' : 'text-slate-900'}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  )
}
