// Membuat file CSV yang langsung rapi dibuka di Excel berbahasa Indonesia:
// pemisah titik koma dan BOM UTF-8 (sama dengan ekspor rekap nilai dari backend).

function escapeCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsvBlob(header, rows) {
  const lines = [header, ...rows].map((row) => row.map(escapeCell).join(';'))
  return new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
}
