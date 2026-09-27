import {
  ArrowRight,
  CalendarDays,
  CalendarSync,
  CircleCheckBig,
  GraduationCap,
  PartyPopper,
  School,
  Sprout,
  TrendingUp,
  UserRound,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { promotionApi } from '../../api/academics'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import Modal from '../../components/Modal'
import PageHero from '../../components/PageHero'
import SelectField from '../../components/SelectField'
import Spinner from '../../components/Spinner'
import SubjectIcon from '../../components/SubjectIcon'
import TextField from '../../components/TextField'
import useDebounce from '../../hooks/useDebounce'
import useFetch from '../../hooks/useFetch'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'

const HERO_ICONS = [CalendarSync, TrendingUp, GraduationCap, School, Users, Sprout, PartyPopper]

const OPTIONS = [
  {
    key: 'recreate_first_grade',
    title: 'Buat ulang kelas X (kosong)',
    description:
      'Kelas X di tahun ajaran baru dibuat dengan nama yang sama, siap diisi siswa baru.',
  },
  {
    key: 'copy_assignments',
    title: 'Salin pengampu',
    description: 'Guru mengajar mapel yang sama di kelas setingkat seperti tahun lalu.',
  },
  {
    key: 'copy_homeroom',
    title: 'Wali kelas ikut naik',
    description: 'Wali kelas mendampingi siswanya ke tingkat berikutnya.',
  },
]

function Step({ number, title, children }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
      <h2 className="flex items-center gap-3 text-lg font-bold text-slate-900">
        <span className="flex size-8 items-center justify-center rounded-full bg-brand-600 text-sm text-white">
          {number}
        </span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Toggle({ checked, onChange, title, description }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl p-4 ring-1 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-700 ${
        checked ? 'bg-brand-50 ring-brand-300' : 'bg-white ring-slate-200 hover:bg-slate-50'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-5 rounded text-brand-600"
      />
      <span>
        <span className="block font-semibold text-slate-900">{title}</span>
        <span className="block text-sm text-slate-500">{description}</span>
      </span>
    </label>
  )
}

// Satu kelas di pratinjau: "X RPL 1 -> XI RPL 1" + daftar siswa (hapus centang = tinggal kelas).
function ClassPlan({ item, holdBack, onToggle }) {
  const graduate = item.action === 'graduate'
  const held = item.students.filter((s) => holdBack.has(s.id)).length
  const moving = item.students.length - held
  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-2">
        <SubjectIcon name={item.name} size="md" />
        <span className="font-bold text-slate-900">{item.name}</span>
        <ArrowRight className="size-4 text-orange-500" aria-hidden="true" />
        {graduate ? (
          <span className="inline-flex items-center gap-1 font-bold text-amber-700">
            <GraduationCap className="size-4" aria-hidden="true" /> Lulus
          </span>
        ) : (
          <>
            <span className="font-bold text-brand-700">{item.target_name}</span>
            <Badge color={item.target_exists ? 'gray' : 'green'}>
              {item.target_exists ? 'sudah ada' : 'kelas baru'}
            </Badge>
          </>
        )}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-4 text-slate-400" aria-hidden="true" />
          {moving} siswa {graduate ? 'lulus' : 'naik kelas'}
          {held > 0 && <strong className="text-red-600"> · {held} tinggal kelas</strong>}
        </span>
        {item.homeroom_teacher_name && (
          <span className="inline-flex items-center gap-1.5">
            <UserRound className="size-4 text-slate-400" aria-hidden="true" />
            Wali: {item.homeroom_teacher_name}
          </span>
        )}
      </p>
      {item.students.length > 0 && (
        <details className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">
            Daftar siswa — hapus centang untuk siswa yang tinggal kelas
          </summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {item.students.map((student) => (
              <li key={student.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white">
                  <input
                    type="checkbox"
                    checked={!holdBack.has(student.id)}
                    onChange={() => onToggle(student.id)}
                    className="size-4 rounded text-brand-600"
                  />
                  <span className={holdBack.has(student.id) ? 'text-red-600 line-through' : ''}>
                    {student.full_name}
                  </span>
                  {student.nis && <span className="text-xs text-slate-400">{student.nis}</span>}
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  )
}

// "Tahun Ajaran Baru" (admin): kenaikan kelas seluruh siswa ke tingkat berikutnya.
export default function PromotionPage() {
  const [fromYear, setFromYear] = useState('')
  const [toYear, setToYear] = useState('')
  const [options, setOptions] = useState({
    recreate_first_grade: true,
    copy_assignments: true,
    copy_homeroom: true,
    graduate: 'deactivate',
  })
  const [holdBack, setHoldBack] = useState(() => new Set())
  const [confirming, setConfirming] = useState(false)
  const [understood, setUnderstood] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const debouncedTo = useDebounce(toYear)
  const plan = useFetch(promotionApi.preview, {
    from_year: fromYear || undefined,
    to_year: debouncedTo || undefined,
    recreate_first_grade: options.recreate_first_grade,
  })
  const data = plan.data
  const shownFrom = fromYear || data?.from_year || ''
  const shownTo = toYear || data?.to_year || ''
  const classes = data?.classes ?? []
  const promoting = classes.filter((c) => c.action === 'promote')
  const graduating = classes.filter((c) => c.action === 'graduate')
  const heldCount = holdBack.size
  const count = (list) => list.reduce((sum, c) => sum + c.students.length, 0)
  const planError = plan.error

  const toggle = (id) =>
    setHoldBack((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const run = async () => {
    setRunning(true)
    setError('')
    try {
      setResult(
        await promotionApi.run({
          from_year: shownFrom,
          to_year: shownTo,
          hold_back: [...holdBack],
          ...options,
        }),
      )
      setConfirming(false)
      setHoldBack(new Set())
      plan.reload()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      const fields = getFieldErrors(err)
      setError(fields.to_year || fields.from_year || getErrorMessage(err))
      setConfirming(false)
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <PageHero
        title="Tahun Ajaran Baru"
        description="Naikkan seluruh siswa ke tingkat berikutnya: X ke XI, XI ke XII, dan XII lulus. Kelas X baru bisa dimulai dari awal."
        icons={HERO_ICONS}
        centerIcon={CalendarSync}
        stats={[
          {
            icon: CalendarDays,
            content: (
              <>
                Tahun ajaran aktif{' '}
                <strong className="text-white">{data?.latest_year ?? '-'}</strong>
              </>
            ),
          },
          {
            icon: TrendingUp,
            content: (
              <>
                <strong className="text-white">{count(promoting)} siswa</strong> naik ·{' '}
                <strong className="text-white">{count(graduating)} siswa</strong> lulus
              </>
            ),
          },
        ]}
      />

      <div className="mt-6 space-y-6">
        {result && (
          <section className="rounded-2xl bg-brand-50 p-5 ring-1 ring-brand-200 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-brand-800">
              <PartyPopper className="size-6" aria-hidden="true" />
              Tahun ajaran {result.to_year} siap digunakan!
            </h2>
            <ul className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
              <li>✅ {result.promoted} siswa naik kelas</li>
              <li>🎓 {result.graduated} siswa lulus</li>
              <li>🔁 {result.held_back} siswa tinggal kelas</li>
              <li>🏫 {result.classrooms_created} kelas baru dibuat</li>
              <li>👩‍🏫 {result.assignments_copied} pengampu disalin</li>
            </ul>
            <p className="mt-3 text-sm text-slate-600">
              Langkah berikutnya: atur wali kelas & pengampu di{' '}
              <Link to="/admin/kelas" className="font-medium text-brand-700 underline">
                Ruang Kelas
              </Link>
              , lalu masukkan siswa baru kelas X lewat{' '}
              <Link to="/admin/pengguna?impor=1" className="font-medium text-brand-700 underline">
                Impor Excel pengguna
              </Link>
              .
            </p>
          </section>
        )}
        <Alert type="error">{error}</Alert>

        <Step number={1} title="Pilih tahun ajaran">
          <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
            <SelectField
              label="Tahun ajaran asal"
              value={shownFrom}
              onChange={(event) => {
                setFromYear(event.target.value)
                setHoldBack(new Set())
              }}
              options={(data?.years ?? []).map((year) => ({ value: year, label: year }))}
            />
            <ArrowRight
              className="mb-3 hidden size-6 text-orange-500 sm:block"
              aria-hidden="true"
            />
            <TextField
              label="Tahun ajaran baru"
              value={shownTo}
              onChange={(event) => setToYear(event.target.value)}
              placeholder="2027/2028"
              hint="Format: 2027/2028. Setelah diproses, tahun ini menjadi tahun ajaran aktif."
            />
          </div>
        </Step>

        <Step number={2} title="Pengaturan">
          <div className="grid gap-3 lg:grid-cols-3">
            {OPTIONS.map((option) => (
              <Toggle
                key={option.key}
                title={option.title}
                description={option.description}
                checked={options[option.key]}
                onChange={(checked) => setOptions({ ...options, [option.key]: checked })}
              />
            ))}
          </div>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-slate-700">
              Siswa kelas XII yang lulus
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                ['deactivate', 'Nonaktifkan akun (tidak bisa login lagi)'],
                ['keep', 'Biarkan akun aktif tanpa kelas'],
              ].map(([value, label]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 ${
                    options.graduate === value
                      ? 'bg-brand-50 font-medium text-brand-800 ring-brand-300'
                      : 'ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="graduate"
                    checked={options.graduate === value}
                    onChange={() => setOptions({ ...options, graduate: value })}
                    className="text-brand-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </Step>

        <Step number={3} title="Pratinjau kenaikan kelas">
          {planError ? (
            <Alert type="error">{planError}</Alert>
          ) : plan.loading && !data ? (
            <div className="py-10 text-center text-brand-600">
              <Spinner />
            </div>
          ) : !classes.length ? (
            <EmptyState title="Belum ada kelas">
              Tambahkan kelas di menu Ruang Kelas terlebih dahulu.
            </EmptyState>
          ) : (
            <div className="space-y-6">
              {['X', 'XI', 'XII'].map((grade) => {
                const list = classes.filter((c) => c.grade === grade)
                if (!list.length) return null
                return (
                  <div key={grade}>
                    <h3 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
                      Kelas {grade}
                      {grade === 'XII' ? ' → lulus' : ` → kelas ${grade === 'X' ? 'XI' : 'XII'}`}
                    </h3>
                    <div className="grid gap-4 lg:grid-cols-2">
                      {list.map((item) => (
                        <ClassPlan
                          key={item.id}
                          item={item}
                          holdBack={holdBack}
                          onToggle={toggle}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
              {data.new_first_grade.length > 0 && (
                <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
                  <h3 className="flex items-center gap-2 font-semibold text-amber-900">
                    <Sprout className="size-5" aria-hidden="true" />
                    Kelas X baru di {data.to_year} (kosong, untuk siswa baru)
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {data.new_first_grade.map((c) => (
                      <Badge key={c.name} color={c.exists ? 'gray' : 'amber'}>
                        {c.name}
                        {c.exists ? ' (sudah ada)' : ''}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Step>

        {classes.length > 0 && !planError && (
          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-slate-200">
            <p className="text-sm text-slate-600">
              <strong className="text-slate-900">
                {count(promoting) - heldInPromoting(promoting, holdBack)}
              </strong>{' '}
              naik ·{' '}
              <strong className="text-slate-900">
                {count(graduating) - heldInPromoting(graduating, holdBack)}
              </strong>{' '}
              lulus · <strong className="text-slate-900">{heldCount}</strong> tinggal kelas · ke{' '}
              <strong className="text-brand-700">{data?.to_year}</strong>
            </p>
            <Button
              onClick={() => {
                setUnderstood(false)
                setConfirming(true)
              }}
            >
              <CalendarSync className="size-4" aria-hidden="true" /> Proses Kenaikan Kelas
            </Button>
          </div>
        )}
      </div>

      <Modal
        open={confirming}
        title={`Mulai tahun ajaran ${data?.to_year ?? ''}?`}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Batal
            </Button>
            <Button loading={running} disabled={!understood} onClick={run}>
              <CircleCheckBig className="size-4" aria-hidden="true" /> Ya, Proses Sekarang
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            Seluruh siswa tahun ajaran <strong>{shownFrom}</strong> akan dipindahkan ke kelas di
            tahun ajaran <strong>{data?.to_year}</strong>. Kelas, materi, tugas, dan nilai tahun
            lalu tetap tersimpan.
          </p>
          <p className="rounded-lg bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200">
            Proses ini tidak bisa dibatalkan otomatis. Siswa hanya bisa melihat materi & tugas
            kelasnya yang baru. Disarankan mencadangkan database terlebih dahulu.
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={understood}
              onChange={(event) => setUnderstood(event.target.checked)}
              className="mt-0.5 size-4 rounded text-brand-600"
            />
            Saya mengerti dan ingin melanjutkan kenaikan kelas.
          </label>
        </div>
      </Modal>
    </>
  )
}

// Jumlah siswa yang tinggal kelas di daftar kelas tertentu.
function heldInPromoting(list, holdBack) {
  return list.reduce((sum, c) => sum + c.students.filter((s) => holdBack.has(s.id)).length, 0)
}
