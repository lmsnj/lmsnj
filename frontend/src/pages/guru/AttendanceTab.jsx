import { CalendarPlus, ClipboardCheck } from 'lucide-react'
import { useState } from 'react'
import { attendanceApi } from '../../api/attendance'
import { sessionsApi } from '../../api/sessions'
import Alert from '../../components/Alert'
import AttendanceSheetModal from '../../components/AttendanceSheetModal'
import AttendanceSummaryTable from '../../components/AttendanceSummaryTable'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import { Panel, PanelItem } from '../../components/Dashboard'
import useFetch from '../../hooks/useFetch'
import { ALL } from '../../utils/academic'
import { getErrorMessage } from '../../utils/errors'
import { formatDate } from '../../utils/media'

const shortDate = (date) =>
  date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })

// Tab "Presensi" di halaman kelas-mapel guru: pertemuan (sesi mengajar) + rekap kehadiran siswa.
export default function AttendanceTab({ assignment }) {
  const [openSession, setOpenSession] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  // Pertemuan sampai akhir hari ini (yang belum dimulai belum bisa diisi; server menolaknya).
  const [endOfToday] = useState(() => {
    const date = new Date()
    date.setHours(23, 59, 59, 999)
    return date.toISOString()
  })
  const sessions = useFetch(sessionsApi.list, {
    ...ALL,
    teaching_assignment: assignment.id,
    starts_at__lte: endOfToday,
    ordering: '-starts_at',
  })
  const summary = useFetch(attendanceApi.summary, { teaching_assignment: assignment.id })
  const list = sessions.data?.results ?? []

  // Pertemuan hari ini dibuat otomatis (sesi tatap muka mulai sekarang), lalu langsung diisi.
  const startToday = async () => {
    setCreating(true)
    setError('')
    try {
      const session = await sessionsApi.create({
        teaching_assignment: assignment.id,
        title: `Pertemuan ${shortDate(new Date())}`,
        starts_at: new Date().toISOString(),
        duration_minutes: 90,
        mode: 'offline',
      })
      sessions.reload()
      setOpenSession(session.id)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Isi presensi untuk setiap pertemuan. Persentase kehadiran dihitung dari pertemuan yang
          sudah diisi.
        </p>
        <Button onClick={startToday} loading={creating}>
          <CalendarPlus className="size-4" aria-hidden="true" /> Pertemuan Hari Ini
        </Button>
      </div>
      <Alert type="success">{notice}</Alert>
      <Alert type="error">{error || sessions.error}</Alert>

      <Panel
        title="Pertemuan"
        icon={ClipboardCheck}
        items={list}
        empty="Belum ada pertemuan. Klik “Pertemuan Hari Ini” atau buat jadwal di menu Sesi Mengajar."
      >
        {list.map((s) => (
          <PanelItem
            key={s.id}
            title={s.title}
            meta={formatDate(s.starts_at)}
            aside={
              <span className="flex items-center gap-2">
                {s.attendance_count > 0 ? (
                  <Badge color="green">Sudah diisi</Badge>
                ) : (
                  <Badge color="amber">Belum diisi</Badge>
                )}
                <Button variant="ghost" size="sm" onClick={() => setOpenSession(s.id)}>
                  {s.attendance_count > 0 ? 'Ubah' : 'Isi'}
                </Button>
              </span>
            }
          />
        ))}
      </Panel>

      <section>
        <h2 className="mb-3 font-semibold text-slate-900">
          Rekap Kehadiran{summary.data ? ` · ${summary.data.meetings} pertemuan tercatat` : ''}
        </h2>
        <Alert type="error">{summary.error}</Alert>
        <AttendanceSummaryTable summary={summary.data} loading={summary.loading} />
      </section>

      {openSession && (
        <AttendanceSheetModal
          sessionId={openSession}
          onClose={() => setOpenSession(null)}
          onSaved={(data) => {
            setOpenSession(null)
            setNotice(`Presensi ${data.title} disimpan.`)
            sessions.reload()
            summary.reload()
          }}
        />
      )}
    </div>
  )
}
