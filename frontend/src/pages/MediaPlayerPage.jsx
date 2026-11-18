import { ArrowLeft } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { mediaPlayApi } from '../api/learningMedia'
import { materialsApi } from '../api/materials'
import Alert from '../components/Alert'
import Spinner from '../components/Spinner'
import useAuth from '../hooks/useAuth'
import useFetch from '../hooks/useFetch'
import MediaPlayer from '../mpi/MediaPlayer'
import { ROLES } from '../utils/constants'

/** Halaman Media Interaktif satu materi: siswa belajar, guru/admin melihat pratinjau. */
export default function MediaPlayerPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data, error, reload } = useFetch(mediaPlayApi.get, id)
  const isStudent = user.role === ROLES.STUDENT
  const writable = data?.read_only === false

  // Membuka media = syarat "Membuka materi" di jalur belajar.
  useEffect(() => {
    if (isStudent && writable) materialsApi.open(id).catch(() => {})
  }, [id, isStudent, writable])

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Kembali
      </button>
      {/* Data lama tetap tampil saat dimuat ulang agar ringkasan stasiun tidak hilang. */}
      {data ? (
        <MediaPlayer
          data={data}
          api={mediaPlayApi}
          materialId={id}
          user={user}
          title={data.title}
          onReload={reload}
          printTo={`/cetak/ringkasan-media/${id}`}
        />
      ) : error ? (
        <Alert type="error">{error}</Alert>
      ) : (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}
    </div>
  )
}
