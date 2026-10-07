// Fungsi murni acara ujian & kartu ujian (ada test-nya di exams.test.js).

// Batas syarat di form acara. Kosong = syarat tidak dipakai. Nama field = field ExamEvent di backend.
export const REQUIREMENT_FIELDS = [
  { name: 'min_attendance', label: 'Kehadiran minimal (%)', max: 100 },
  { name: 'min_task_rate', label: 'Tugas terkumpul minimal (%)', max: 100 },
  { name: 'min_average', label: 'Rata-rata nilai minimal', max: 100 },
  { name: 'min_paid_quarter', label: 'Lunas minimal sampai triwulan', max: 4 },
]

const TEXT_FIELDS = ['name', 'academic_year', 'card_note', 'signer_title', 'signer_name']
const DATE_FIELDS = ['exam_start', 'exam_end', 'period_start', 'period_end']

/** Isi form dari acara yang ada (atau acara baru). Angka & tanggal kosong = ''. */
export function eventToForm(event, academicYear) {
  const form = {
    grades: event?.grades ?? [],
    count_excused: event?.count_excused ?? true,
    require_homeroom_check: event?.require_homeroom_check ?? false,
  }
  for (const field of TEXT_FIELDS) form[field] = event?.[field] ?? ''
  if (!event) form.academic_year = academicYear
  for (const field of [...DATE_FIELDS, ...REQUIREMENT_FIELDS.map((f) => f.name)]) {
    form[field] = event?.[field] ?? ''
  }
  for (const { name } of REQUIREMENT_FIELDS)
    form[name] = form[name] === '' ? '' : String(form[name])
  return form
}

/** Data yang dikirim ke API: isian kosong = null (syarat tidak dipakai / tanggal tidak diisi). */
export function formToPayload(form) {
  const payload = { ...form }
  for (const field of DATE_FIELDS) payload[field] = form[field] || null
  for (const { name } of REQUIREMENT_FIELDS) {
    payload[name] = form[name] === '' ? null : Number(form[name])
  }
  return payload
}

export const gradesLabel = (grades) =>
  grades?.length ? `Kelas ${grades.join(', ')}` : 'Semua tingkat'

/** Daftar syarat yang dipakai acara dalam kalimat pendek. */
export function requirementSummary(event) {
  const items = []
  if (event.min_attendance !== null) {
    const excused = event.count_excused ? ' (sakit & izin dihitung hadir)' : ''
    items.push(`Kehadiran minimal ${event.min_attendance}%${excused}`)
  }
  if (event.min_task_rate !== null) items.push(`Tugas terkumpul minimal ${event.min_task_rate}%`)
  if (event.min_average !== null) items.push(`Rata-rata nilai minimal ${event.min_average}`)
  if (event.min_paid_quarter !== null) {
    items.push(`Pembayaran lunas sampai triwulan ${event.min_paid_quarter}`)
  }
  if (event.require_homeroom_check) items.push('Persetujuan wali kelas')
  return items
}

const formatNumber = (value) => String(value).replace('.', ',')

/** Nilai satu syarat siswa untuk ditampilkan di tabel. */
export function formatCheckValue(check) {
  if (check.key === 'homeroom') return check.value ? 'Disetujui' : 'Belum'
  if (check.value === null || check.value === undefined) return 'Belum ada data'
  if (check.key === 'paid_quarter') return check.value ? `Triwulan ${check.value}` : 'Belum bayar'
  if (check.key === 'average') return formatNumber(check.value)
  return `${formatNumber(check.value)}%`
}

/** Status kartu satu siswa: layak karena syarat, layak karena dikecualikan, atau belum layak. */
export function eligibilityStatus(row) {
  if (row.requirements_met) return { label: 'Memenuhi syarat', color: 'green' }
  if (row.eligible) return { label: 'Dikecualikan', color: 'blue' }
  return { label: 'Belum memenuhi', color: 'red' }
}

export function countEligibility(rows) {
  const counts = { total: rows.length, met: 0, exempted: 0, notEligible: 0 }
  for (const row of rows) {
    if (row.requirements_met) counts.met += 1
    else if (row.eligible) counts.exempted += 1
    else counts.notEligible += 1
  }
  return counts
}

/** Tanggal "YYYY-MM-DD" dibaca sebagai tanggal lokal (bukan UTC) agar tidak mundur sehari. */
const parseDate = (value) => new Date(`${value}T00:00:00`)
const formatDay = (value) =>
  new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(parseDate(value))

/** "1 Desember 2026" atau "1 Desember 2026 – 7 Desember 2026". */
export function formatDateRange(start, end) {
  if (!start) return '-'
  if (!end || end === start) return formatDay(start)
  return `${formatDay(start)} – ${formatDay(end)}`
}

/** Pecah kartu per halaman cetak (bawaan 8 kartu per lembar A4). */
export function paginate(items, size = 8) {
  const pages = []
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size))
  }
  return pages
}
