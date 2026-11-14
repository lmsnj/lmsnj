import { CalendarDays, Clock, Coffee, GraduationCap, School, Users } from 'lucide-react'
import { useState } from 'react'
import { timetableApi } from '../api/timetable'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import DataTable from '../components/DataTable'
import EmptyState from '../components/EmptyState'
import PageHero from '../components/PageHero'
import SelectField from '../components/SelectField'
import Spinner from '../components/Spinner'
import useAuth from '../hooks/useAuth'
import useFetch from '../hooks/useFetch'
import { useTabs } from '../hooks/useTabs'
import { isAdminRole, ROLES } from '../utils/constants'
import {
  countPeriods,
  dayRows,
  daysOf,
  defaultDay,
  loadGap,
  optionsFrom,
  timeRange,
  weekdayOf,
} from '../utils/timetable'

const DESCRIPTIONS = {
  [ROLES.ADMIN]: 'Jadwal pelajaran mingguan seluruh kelas dan guru.',
  [ROLES.FOUNDATION]: 'Jadwal pelajaran mingguan seluruh kelas dan guru.',
  [ROLES.TEACHER]: 'Jadwal mengajar Anda setiap minggu.',
  [ROLES.STUDENT]: 'Jadwal pelajaran kelasmu setiap minggu.',
}

const ADMIN_TABS = [
  { id: 'jadwal', label: 'Jadwal' },
  { id: 'beban', label: 'Beban Mengajar Guru' },
]

const VIEWS = [
  { value: 'classroom', label: 'Per kelas' },
  { value: 'teacher', label: 'Per guru' },
]

function effectiveDate(value) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(value))
}

// Pilihan hari. Hari ini diberi tanda agar mudah ditemukan.
function DayPicker({ days, selected, onSelect }) {
  const today = weekdayOf()
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Pilih hari">
      {days.map(({ day, label }) => (
        <button
          key={day}
          type="button"
          role="tab"
          aria-selected={selected === day}
          onClick={() => onSelect(day)}
          className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ring-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
            selected === day
              ? 'bg-brand-600 text-white ring-brand-600'
              : 'bg-white text-slate-700 ring-slate-200 hover:bg-brand-50'
          }`}
        >
          {label}
          {day === today && (
            <span className="ml-1.5 text-xs font-normal opacity-80">(hari ini)</span>
          )}
        </button>
      ))}
    </div>
  )
}

function Lesson({ lesson, showTeacher, showClassrooms }) {
  const details = [
    showClassrooms && lesson.classrooms.join(', '),
    showTeacher && lesson.teacherName,
  ].filter(Boolean)
  return (
    <div>
      <p className="font-semibold text-slate-900">{lesson.subjectName}</p>
      {details.length > 0 && <p className="text-sm text-slate-500">{details.join(' • ')}</p>}
    </div>
  )
}

function SlotRow({ row, showTeacher, showClassrooms }) {
  const { slot, lessons } = row
  const isActivity = slot.kind === 'activity'
  return (
    <li
      className={`flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 ${
        isActivity ? 'bg-slate-50' : ''
      }`}
    >
      <div className="flex shrink-0 items-center gap-2 sm:w-44">
        <span className="text-sm font-medium text-slate-700 tabular-nums">{timeRange(slot)}</span>
        {slot.period != null && !isActivity && <Badge color="green">Jam {slot.period}</Badge>}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {isActivity && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Coffee className="size-4" aria-hidden="true" />
            {slot.label || 'Kegiatan'}
          </p>
        )}
        {!isActivity && lessons.length === 0 && <p className="text-sm text-slate-400">Kosong</p>}
        {!isActivity &&
          lessons.map((lesson) => (
            <Lesson
              key={lesson.key}
              lesson={lesson}
              showTeacher={showTeacher}
              showClassrooms={showClassrooms}
            />
          ))}
      </div>
    </li>
  )
}

function WeekSchedule({ slots, entries, showTeacher, showClassrooms }) {
  const days = daysOf(slots)
  const [picked, setPicked] = useState(null)
  const day = picked ?? defaultDay(days)
  const rows = dayRows(slots, entries, day)
  return (
    <div className="space-y-4">
      <DayPicker days={days} selected={day} onSelect={setPicked} />
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        {rows.map((row) => (
          <SlotRow
            key={row.slot.id}
            row={row}
            showTeacher={showTeacher}
            showClassrooms={showClassrooms}
          />
        ))}
      </ul>
    </div>
  )
}

// Admin: pilih melihat jadwal satu kelas atau satu guru. Data sudah dimuat semua, disaring di browser.
function AdminSchedule({ slots, entries }) {
  const [view, setView] = useState('classroom')
  const [choice, setChoice] = useState({ classroom: '', teacher: '' })
  const idKey = view
  const options = optionsFrom(entries, idKey, `${view}_name`)
  const selected = choice[view] || options[0]?.value || ''
  const shown = entries.filter((entry) => String(entry[idKey]) === selected)
  return (
    <div className="space-y-4">
      <div className="grid gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
        <SelectField
          label="Tampilkan"
          value={view}
          onChange={(event) => setView(event.target.value)}
          options={VIEWS}
        />
        <SelectField
          label={view === 'classroom' ? 'Kelas' : 'Guru'}
          value={selected}
          onChange={(event) => setChoice({ ...choice, [view]: event.target.value })}
          options={options}
        />
        <p className="text-sm text-slate-500 sm:pb-2">{countPeriods(shown)} jam per minggu</p>
      </div>
      <WeekSchedule
        key={`${view}-${selected}`}
        slots={slots}
        entries={shown}
        showTeacher={view === 'classroom'}
        showClassrooms={view === 'teacher'}
      />
    </div>
  )
}

function gapBadge(load) {
  const gap = loadGap(load)
  if (gap === null) return <span className="text-slate-400">-</span>
  if (gap === 0) return <Badge color="green">Sesuai</Badge>
  return <Badge color="amber">{gap > 0 ? `+${gap}` : gap} jam</Badge>
}

const LOAD_COLUMNS = [
  { header: 'Kode', cell: (row) => row.teacher_code ?? '-' },
  {
    header: 'Guru',
    cell: (row) => <span className="font-medium text-slate-900">{row.teacher_name}</span>,
  },
  { header: 'Jam terjadwal', cell: (row) => row.scheduled_periods, className: 'text-right' },
  { header: 'JP resmi', cell: (row) => row.official_hours ?? '-', className: 'text-right' },
  {
    header: 'Di luar jadwal',
    cell: (row) => row.unscheduled_hours || '-',
    className: 'text-right',
  },
  { header: 'Selisih', cell: gapBadge },
]

function TeacherLoads() {
  const { data, loading, error } = useFetch(timetableApi.teacherLoads)
  return (
    <div className="space-y-3">
      <Alert type="error">{error}</Alert>
      <p className="text-sm text-slate-500">
        Jam terjadwal dihitung dari jadwal (kelas gabungan dihitung sekali). JP resmi berasal dari
        dokumen distribusi JP; bagian yang tidak dijadwalkan, misalnya PKL, ditampilkan di kolom
        &quot;Di luar jadwal&quot; dan tidak ikut dihitung dalam selisih.
      </p>
      <DataTable
        columns={LOAD_COLUMNS}
        rows={data}
        loading={loading}
        rowKey={(row) => row.teacher}
        emptyMessage="Belum ada guru di jadwal."
      />
    </div>
  )
}

function AdminTimetable({ slots, entries }) {
  const [tab, tabsBar] = useTabs(ADMIN_TABS)
  return (
    <div>
      {tabsBar}
      {tab === 'jadwal' ? <AdminSchedule slots={slots} entries={entries} /> : <TeacherLoads />}
    </div>
  )
}

export default function TimetablePage() {
  const { user } = useAuth()
  const { data, loading, error } = useFetch(timetableApi.get)
  const timetable = data?.timetable
  const entries = data?.entries ?? []
  const slots = data?.slots ?? []
  // Super Admin yang membuka sekolah bertindak sebagai admin sekolah itu.
  const isAdmin = isAdminRole(user.role)
  const isTeacher = user.role === ROLES.TEACHER

  const stats = []
  if (timetable) {
    stats.push({
      icon: CalendarDays,
      content: `${timetable.academic_year} semester ${timetable.semester_display} • berlaku sejak ${effectiveDate(timetable.effective_from)}`,
    })
    if (isAdmin) {
      stats.push({
        icon: School,
        content: `${optionsFrom(entries, 'classroom', 'classroom_name').length} kelas`,
      })
      stats.push({
        icon: Users,
        content: `${optionsFrom(entries, 'teacher', 'teacher_name').length} guru`,
      })
    } else {
      stats.push({ icon: Clock, content: `${countPeriods(entries)} jam pelajaran per minggu` })
    }
  }

  let content
  if (loading && !data) {
    content = (
      <div className="py-16 text-center text-brand-600">
        <Spinner className="size-8" />
      </div>
    )
  } else if (error) {
    content = <Alert type="error">{error}</Alert>
  } else if (!timetable) {
    content = (
      <EmptyState title="Jadwal pelajaran belum tersedia">
        {isAdmin
          ? 'Impor jadwal dengan perintah import_timetable di server (lihat docs/jadwal/README.md).'
          : 'Jadwal akan tampil di sini setelah diatur oleh admin sekolah.'}
      </EmptyState>
    )
  } else if (entries.length === 0) {
    content = (
      <EmptyState title="Belum ada jadwal untuk Anda">
        {isTeacher
          ? 'Anda belum punya jam mengajar pada jadwal yang berlaku.'
          : isAdmin
            ? 'Jadwal yang aktif belum berisi pelajaran.'
            : 'Kelasmu belum ada di jadwal yang berlaku. Hubungi wali kelas atau admin.'}
      </EmptyState>
    )
  } else if (isAdmin) {
    content = <AdminTimetable slots={slots} entries={entries} />
  } else {
    content = (
      <WeekSchedule
        slots={slots}
        entries={entries}
        showTeacher={!isTeacher}
        showClassrooms={isTeacher}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHero
        title="Jadwal Pelajaran"
        description={DESCRIPTIONS[user.role]}
        icons={[CalendarDays, Clock, GraduationCap, School]}
        centerIcon={CalendarDays}
        stats={stats}
      />
      {content}
    </div>
  )
}
