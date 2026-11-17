import { ChevronDown, ChevronRight, CircleCheck, ClipboardCheck, Lock } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { resultDisplay } from '../utils/assessments'
import { defaultGroupIndex, groupProgress } from '../utils/learningPath'
import Badge from './Badge'
import { DoneIcon, LockedMessage, MaterialActivities } from './MaterialModule'
import ProgressBar from './ProgressBar'

// Label kelompok: "Bab N" untuk bab, "Pengantar" untuk materi tanpa bab.
function groupLabel(group, index, hasLoose) {
  if (!group.chapter) return 'Pengantar'
  return `Bab ${hasLoose ? index : index + 1}`
}

function groupTitle(group) {
  return group.chapter?.title ?? 'Materi Pengantar'
}

// Kartu satu bab di kolom kiri.
function ChapterCard({ group, label, selected, onSelect }) {
  const progress = groupProgress(group)
  const hasPostTest = Boolean(group.chapter?.post_test && group.chapter.post_test_published)
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={`flex w-full items-start gap-3 rounded-xl p-4 text-left ring-1 transition ${
          selected
            ? 'bg-brand-50 ring-2 ring-brand-500'
            : 'bg-white ring-slate-200 hover:bg-slate-50'
        }`}
      >
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            progress.locked
              ? 'bg-slate-200 text-slate-500'
              : progress.completed
                ? 'bg-brand-600 text-white'
                : 'bg-brand-100 text-brand-800'
          }`}
        >
          {progress.locked ? (
            <Lock className="size-4" aria-hidden="true" />
          ) : progress.completed ? (
            <CircleCheck className="size-5" aria-hidden="true" />
          ) : (
            label.replace(/\D/g, '') || '•'
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-slate-500">{label}</span>
          <span
            className={`mt-0.5 block font-semibold ${progress.locked ? 'text-slate-500' : 'text-slate-900'}`}
          >
            {groupTitle(group)}
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            {progress.total} materi{hasPostTest && ' + Post Test'}
          </span>
          <span className="mt-2 block">
            {progress.locked ? (
              <Badge color="gray">Terkunci</Badge>
            ) : progress.completed ? (
              <Badge color="green">Tuntas</Badge>
            ) : (
              <Badge color="amber">
                {selected ? 'Sedang dipelajari' : 'Pelajari Materi'} ({progress.done}/
                {progress.total})
              </Badge>
            )}
          </span>
        </span>
      </button>
    </li>
  )
}

// Satu materi di akordeon "Daftar Materi".
function MaterialAccordion({ material, open, onToggle, onChange }) {
  const progress = material.progress
  const panelId = `materi-${material.id}`
  return (
    <li className="rounded-xl ring-1 ring-slate-200">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-4 py-4 text-left"
      >
        {progress.locked ? (
          <Lock className="size-5 shrink-0 text-slate-400" aria-hidden="true" />
        ) : (
          <DoneIcon done={progress.completed} className="size-6" />
        )}
        <span
          className={`min-w-0 flex-1 font-semibold ${progress.locked ? 'text-slate-500' : 'text-slate-900'}`}
        >
          {material.title}
        </span>
        <ChevronDown
          className={`size-5 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={panelId} className="space-y-4 border-t border-slate-200 px-4 py-4">
          {progress.locked ? (
            <LockedMessage lockedBy={progress.locked_by} />
          ) : (
            <>
              {material.description && (
                <p className="text-sm whitespace-pre-line text-slate-700">{material.description}</p>
              )}
              <MaterialActivities material={material} onChange={onChange} />
            </>
          )}
        </div>
      )}
    </li>
  )
}

// Kartu Post Test di bawah daftar materi bab.
function PostTestCard({ chapter }) {
  const progress = chapter.progress
  const status = progress?.post_test_status
  const done = status === 'passed' || status === 'graded'
  const display = resultDisplay({ status })
  const lockedBy = progress?.post_test_locked_by
  const body = (
    <>
      {done ? (
        <DoneIcon done className="size-6" />
      ) : (
        <ClipboardCheck className="size-6 shrink-0 text-slate-500" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-900">Kerjakan post test</span>
        <span className="block text-sm text-slate-500">
          {chapter.post_test_title} &middot; Evaluasi pemahaman bab
        </span>
        {display && (
          <span className="mt-1 block">
            <Badge color={display.color}>{display.label}</Badge>
          </span>
        )}
      </span>
      {!lockedBy && <ChevronRight className="size-5 shrink-0 text-slate-500" aria-hidden="true" />}
    </>
  )
  return (
    <section>
      <h3 className="font-semibold text-slate-900">Post Test</h3>
      <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-slate-200">
        {lockedBy ? (
          <>
            <div className="flex items-center gap-3 px-4 py-4 opacity-70">{body}</div>
            <p className="flex items-center gap-2 bg-slate-100 px-4 py-3 text-sm text-slate-600">
              <Lock className="size-4 shrink-0" aria-hidden="true" />
              Pelajari materi di atas terlebih dahulu.
            </p>
          </>
        ) : (
          <Link
            to={`/siswa/asesmen/${chapter.post_test}`}
            className="flex items-center gap-3 px-4 py-4 hover:bg-slate-50"
          >
            {body}
          </Link>
        )}
      </div>
    </section>
  )
}

function ChapterDetail({ group, label, onChange }) {
  const progress = groupProgress(group)
  // Materi yang terbuka di akordeon: yang sedang dipelajari (null = semua tertutup).
  const current = group.materials.find((m) => !m.progress.locked && !m.progress.completed)
  const [openId, setOpenId] = useState(current?.id ?? null)
  const chapter = group.chapter
  const hasPostTest = Boolean(chapter?.post_test && chapter.post_test_published)

  return (
    <div className="space-y-4">
      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs text-slate-500">{label}</p>
        <h3 className="mt-1 text-xl font-bold text-slate-900">{groupTitle(group)}</h3>
        <ProgressBar
          className="mt-4"
          value={progress.done}
          max={progress.total}
          label={`${progress.done} dari ${progress.total} materi tercapai`}
        />
        {progress.locked && (
          <div className="mt-4">
            <LockedMessage lockedBy={progress.lockedBy} />
          </div>
        )}
      </section>

      <section className="space-y-5 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div>
          <h3 className="font-semibold text-slate-900">Daftar Materi</h3>
          <ul className="mt-3 space-y-3">
            {group.materials.map((material) => (
              <MaterialAccordion
                key={material.id}
                material={material}
                open={openId === material.id}
                onToggle={() => setOpenId(openId === material.id ? null : material.id)}
                onChange={onChange}
              />
            ))}
          </ul>
        </div>
        {hasPostTest && <PostTestCard chapter={chapter} />}
      </section>
    </div>
  )
}

/**
 * Tampilan bab untuk siswa (dipakai jika guru membuat Bab): kolom kiri "Yang akan dipelajari" +
 * daftar bab berurutan (terkunci/tuntas), kolom kanan materi bab terpilih dalam akordeon (aktivitas
 * + cerita reflektif) lalu Post Test. Materi tanpa bab tampil sebagai "Pengantar" di depan.
 * Aturan kunci dari backend (`material.progress`, `chapter.progress`).
 */
export default function ChapterModule({ groups, onChange }) {
  const [selected, setSelected] = useState(null)
  const index = selected ?? defaultGroupIndex(groups)
  const group = groups[index] ?? groups[0]
  const hasLoose = groups.some((g) => !g.chapter)
  const labels = groups.map((g, i) => groupLabel(g, i, hasLoose))
  const description = group.chapter?.description

  const select = (next) => {
    setSelected(next)
    // Di HP detail ada di bawah daftar; gulir agar langsung terlihat.
    if (window.innerWidth < 1024) {
      document.getElementById('detail-bab')?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  if (!group) return null
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <aside className="space-y-5">
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h3 className="font-semibold text-slate-900">Yang akan dipelajari</h3>
          {description ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {description
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => (
                  <li key={line}>{line}</li>
                ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              {group.chapter
                ? 'Guru belum menuliskan tujuan bab ini.'
                : 'Materi pengantar sebelum bab pertama.'}
            </p>
          )}
        </section>
        <section>
          <h3 className="font-semibold text-slate-900">Bab Pembelajaran</h3>
          <p className="text-sm text-slate-500">Pelajari bab sesuai urutan.</p>
          <ul className="mt-3 space-y-3">
            {groups.map((g, i) => (
              <ChapterCard
                key={g.chapter?.id ?? 'pengantar'}
                group={g}
                label={labels[i]}
                selected={i === index}
                onSelect={() => select(i)}
              />
            ))}
          </ul>
        </section>
      </aside>
      <div id="detail-bab" className="scroll-mt-20">
        {/* key: akordeon diatur ulang saat pindah bab. */}
        <ChapterDetail
          key={group.chapter?.id ?? 'pengantar'}
          group={group}
          label={labels[index]}
          onChange={onChange}
        />
      </div>
    </div>
  )
}
