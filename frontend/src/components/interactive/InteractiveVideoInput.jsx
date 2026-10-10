import { CircleCheck, CircleX, Clock, Pause, SkipForward } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { videoSource } from '../../api/assessments'
import { getErrorMessage } from '../../utils/errors'
import { formatScore } from '../../utils/tasks'
import {
  checkpointGuard,
  CHECKPOINT_KINDS,
  formatTime,
  isCheckpointDone,
  isSubComplete,
  SEEK_JUMP,
} from '../../utils/interactive'
import Button from '../Button'
import RichText from '../RichText'
import CheckpointQuestion from './CheckpointQuestion'
import VideoPlayer from './VideoPlayer'

const kindLabel = (kind) => CHECKPOINT_KINDS.find((k) => k.value === kind)?.label ?? kind
// Posisi terjauh disimpan (untuk melanjutkan setelah refresh) setiap maju sekian detik.
const POSITION_STEP = 5

function CheckpointHeader({ checkpoint, number, total }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[0.8em] text-slate-600">
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-0.5 font-semibold text-white">
        <Clock className="size-[1.1em]" aria-hidden="true" /> {formatTime(checkpoint.time)}
      </span>
      <span>
        Pertanyaan {number} dari {total} · {kindLabel(checkpoint.kind)} · {checkpoint.points} poin
      </span>
      {!checkpoint.required && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5">Boleh dilewati</span>
      )}
    </div>
  )
}

// Umpan balik mode latihan (dinilai server): benar/salah, poin, dan pembahasan.
function Feedback({ result, dir }) {
  return (
    <div
      className={`space-y-2 rounded-lg p-3 ring-1 ${
        result.correct ? 'bg-brand-50 ring-brand-200' : 'bg-red-50 ring-red-200'
      }`}
      role="status"
    >
      <p
        className={`flex items-center gap-2 font-semibold ${result.correct ? 'text-brand-800' : 'text-red-700'}`}
      >
        {result.correct ? (
          <CircleCheck className="size-5" aria-hidden="true" />
        ) : (
          <CircleX className="size-5" aria-hidden="true" />
        )}
        {result.correct ? 'Benar!' : 'Belum tepat'} · {formatScore(result.points)}/
        {result.max_points} poin
      </p>
      {result.explanation && (
        <div className="text-[0.9em] text-slate-700">
          <p className="font-medium">Pembahasan:</p>
          <RichText text={result.explanation} dir={dir} />
        </div>
      )}
    </div>
  )
}

// Halaman hasil / editor guru: daftar checkpoint dengan jawaban, benar/salah, kunci, pembahasan.
function VideoReview({ content, value, dir, review }) {
  const keys = review?.key?.checkpoints
  return (
    <ol className="space-y-3">
      {content.checkpoints.map((cp, index) => {
        const detail = review?.result?.[cp.id]
        const key = keys?.[cp.id]
        const skipped = value?.skipped?.includes(cp.id)
        return (
          <li key={cp.id} className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <CheckpointHeader
                checkpoint={cp}
                number={index + 1}
                total={content.checkpoints.length}
              />
              {detail && (
                <span className="text-sm font-semibold text-slate-700">
                  {formatScore(detail.points)}/{cp.points}
                </span>
              )}
            </div>
            {cp.text && <RichText text={cp.text} dir={dir} className="font-medium" />}
            {skipped && !review?.keyOnly && (
              <p className="text-xs text-slate-500">Dilewati oleh siswa.</p>
            )}
            <CheckpointQuestion
              checkpoint={cp}
              value={value?.checkpoints?.[cp.id]}
              dir={dir}
              review={{ result: detail?.correct, key, keyOnly: review?.keyOnly }}
            />
            {key?.explanation && (
              <div className="text-sm text-slate-700">
                <span className="font-medium">Pembahasan: </span>
                <RichText text={key.explanation} dir={dir} as="span" />
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Video interaktif. Video berhenti otomatis di setiap checkpoint dan pertanyaannya muncul di atas
 * video; setelah dijawab video lanjut. Jika guru tidak mengizinkan lompat ke depan, siswa yang
 * menggeser video melewati checkpoint yang belum dijawab dikembalikan ke checkpoint itu.
 * Mode latihan: jawaban diperiksa server lewat `onCheck(idCheckpoint, jawaban)` -> umpan balik
 * (`feedback[idCheckpoint]`). Mode ujian: tanpa umpan balik.
 */
export default function InteractiveVideoInput({
  content,
  value,
  onChange,
  dir,
  review,
  onCheck,
  feedback = {},
  preview,
}) {
  const response = value ?? {}
  const responseRef = useRef(response)
  const controls = useRef(null)
  const last = useRef(response.position ?? 0)
  const openRef = useRef(null)
  const [open, setOpen] = useState(null)
  const [draft, setDraft] = useState({})
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  // Detik terjauh yang sudah ditonton (untuk daftar pertanyaan yang boleh dibuka).
  const [reached, setReached] = useState(response.position ?? 0)
  const checkpoints = content.checkpoints
  const practice = content.mode === 'practice'

  useEffect(() => {
    responseRef.current = response
  })

  if (review) return <VideoReview content={content} value={value} dir={dir} review={review} />

  // Di handler memakai ref (nilai terbaru), di tampilan memakai prop.
  const doneIn = (resp) => (cp) => isCheckpointDone(cp, resp) || Boolean(feedback[cp.id])
  const isDone = (cp) => doneIn(responseRef.current)(cp)
  const update = (changes) => onChange({ ...responseRef.current, ...changes })

  const openCheckpoint = (cp) => {
    controls.current?.pause()
    openRef.current = cp.id
    setOpen(cp.id)
    setDraft(responseRef.current.checkpoints?.[cp.id] ?? feedback[cp.id]?.response ?? {})
    setError('')
  }
  const closeAndPlay = () => {
    openRef.current = null
    setOpen(null)
    controls.current?.play()
  }

  const handleTick = (time) => {
    if (openRef.current) {
      controls.current?.pause()
      return
    }
    const guard = checkpointGuard({
      time,
      last: last.current,
      checkpoints,
      isDone,
      allowSeek: content.allow_seek,
    })
    if (guard) {
      if (guard.rewind) controls.current?.seek(guard.checkpoint.time)
      last.current = guard.checkpoint.time
      openCheckpoint(guard.checkpoint)
      return
    }
    last.current = time
    setReached((value) => (time > value + 1 ? Math.floor(time) : value))
    if (time - (responseRef.current.position ?? 0) >= POSITION_STEP) {
      update({ position: Math.floor(time) })
    }
  }

  const handleEnded = () => {
    // Checkpoint di detik terakhir bisa terlewat oleh pengecekan berkala.
    const pending = checkpoints.find(
      (cp) => !isDone(cp) && (!content.allow_seek || cp.time >= last.current - SEEK_JUMP),
    )
    if (pending) openCheckpoint(pending)
  }

  const current = checkpoints.find((cp) => cp.id === open)
  const result = current ? feedback[current.id] : null
  const withAnswer = (cp, answer) => ({
    checkpoints: { ...(responseRef.current.checkpoints ?? {}), [cp.id]: answer },
    skipped: (responseRef.current.skipped ?? []).filter((id) => id !== cp.id),
  })

  const answer = async () => {
    if (practice && onCheck) {
      setChecking(true)
      setError('')
      try {
        await onCheck(current.id, draft)
        update(withAnswer(current, draft))
      } catch (err) {
        setError(getErrorMessage(err, 'Jawaban gagal diperiksa. Periksa koneksi lalu coba lagi.'))
      } finally {
        setChecking(false)
      }
      return
    }
    update(withAnswer(current, draft))
    closeAndPlay()
  }
  const skip = () => {
    update({ skipped: [...new Set([...(responseRef.current.skipped ?? []), current.id])] })
    closeAndPlay()
  }

  const src = content.source === 'file' ? videoSource(content.video_url) : null
  const shownDone = doneIn(response)
  const doneCount = checkpoints.filter(shownDone).length

  return (
    <div className="space-y-4">
      <VideoPlayer
        source={content.source}
        youtubeId={content.youtube_id}
        src={src}
        onReady={(api) => {
          controls.current = api
          // Lanjutkan dari posisi terakhir (setelah halaman dimuat ulang).
          if (response.position) api.seek(response.position)
        }}
        onTick={handleTick}
        onEnded={handleEnded}
      >
        {current && (
          <div
            className="fixed inset-0 z-50 flex items-end bg-slate-900/60 sm:absolute sm:z-10 sm:items-center sm:justify-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`Pertanyaan pada ${formatTime(current.time)}`}
          >
            <div className="max-h-[85dvh] w-full space-y-3 overflow-y-auto rounded-t-2xl bg-white p-4 text-slate-900 shadow-xl sm:max-h-full sm:max-w-2xl sm:rounded-xl sm:p-5">
              <CheckpointHeader
                checkpoint={current}
                number={checkpoints.indexOf(current) + 1}
                total={checkpoints.length}
              />
              <p className="flex items-center gap-1.5 text-[0.8em] text-slate-500">
                <Pause className="size-4" aria-hidden="true" /> Video berhenti. Jawab untuk
                melanjutkan.
              </p>
              {current.text && <RichText text={current.text} dir={dir} className="font-medium" />}
              <CheckpointQuestion
                key={current.id}
                checkpoint={current}
                value={result ? result.response : draft}
                onChange={result ? undefined : setDraft}
                dir={dir}
                // Setelah diperiksa: jawaban salah merah, kunci hijau (dari server).
                review={result ? { result: result.detail, key: result.key } : undefined}
              />
              {result && <Feedback result={result} dir={dir} />}
              {preview && practice && !result && (
                <p className="text-xs text-slate-500">
                  Pratinjau: pada mode latihan, siswa melihat benar/salah dan pembahasan di sini
                  setelah menjawab.
                </p>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                {result ? (
                  <Button onClick={closeAndPlay}>Lanjutkan Video</Button>
                ) : (
                  <>
                    {!current.required && (
                      <Button variant="secondary" onClick={skip}>
                        <SkipForward className="size-4" aria-hidden="true" /> Lewati
                      </Button>
                    )}
                    <Button
                      loading={checking}
                      disabled={!isSubComplete(current, draft)}
                      onClick={answer}
                    >
                      {practice && onCheck ? 'Periksa Jawaban' : 'Simpan & Lanjutkan'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </VideoPlayer>

      <section className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <p className="mb-2 text-[0.8em] font-semibold tracking-wide text-slate-500 uppercase">
          Pertanyaan dalam video · {doneCount}/{checkpoints.length} selesai
        </p>
        <ol className="space-y-1.5">
          {checkpoints.map((cp, index) => {
            const done = shownDone(cp)
            const skipped = response.skipped?.includes(cp.id)
            const locked = Boolean(feedback[cp.id])
            // Belum ditonton sampai sini & tidak boleh lompat: belum bisa dibuka.
            const canOpen = done || content.allow_seek || cp.time <= reached + SEEK_JUMP
            return (
              <li key={cp.id} className="flex items-center gap-2 text-[0.9em]">
                <span className="w-12 shrink-0 font-mono text-slate-600">
                  {formatTime(cp.time)}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-700">
                  {index + 1}. {cp.text || kindLabel(cp.kind)}
                </span>
                <span
                  className={`shrink-0 text-xs font-medium ${
                    skipped ? 'text-slate-500' : done ? 'text-brand-700' : 'text-amber-700'
                  }`}
                >
                  {skipped ? 'Dilewati' : done ? 'Terjawab' : 'Belum'}
                </span>
                {canOpen && (
                  <Button size="sm" variant="ghost" onClick={() => openCheckpoint(cp)}>
                    {locked ? 'Lihat' : done ? 'Ubah' : 'Jawab'}
                  </Button>
                )}
              </li>
            )
          })}
        </ol>
        {!content.allow_seek && (
          <p className="mt-2 text-xs text-slate-500">
            Video tidak bisa dilompati melewati pertanyaan yang belum dijawab.
          </p>
        )}
      </section>
    </div>
  )
}
