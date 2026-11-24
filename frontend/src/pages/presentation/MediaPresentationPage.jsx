import { useRef } from 'react'
import { useParams } from 'react-router-dom'
import { mediaPlayApi } from '../../api/learningMedia'
import { loadPresentation } from '../../components/presentation/loadPresentation'
import PresentationFrame from '../../components/presentation/PresentationFrame'
import PresentationStatus from '../../components/presentation/PresentationStatus'
import useAuth from '../../hooks/useAuth'
import useFetch from '../../hooks/useFetch'
import usePresentationBack from '../../hooks/usePresentationBack'
import MediaPlayer from '../../mpi/MediaPlayer'

// Tombol Lanjut/Kembali di pemutar media diberi penanda data-present (StepPlayer), jadi remote
// presenter cukup "menekan" tombol yang sedang tampil dan aktif.
// Kembali di langkah pertama = kembali ke peta stasiun.
function pressButton(root, ...names) {
  for (const name of names) {
    const button = root?.querySelector(`[data-present="${name}"]:not(:disabled)`)
    if (button) return button.click()
  }
}

function Presentation({ material, settings, media, reload }) {
  const back = usePresentationBack()
  const { user } = useAuth()
  const stageRef = useRef(null)

  return (
    <PresentationFrame
      title={material.title}
      subtitle={[material.subject_name, material.classroom_name].filter(Boolean).join(' • ')}
      settings={settings.values}
      stage="media"
      onAction={(action) => {
        if (action === 'next') pressButton(stageRef.current, 'next')
        if (action === 'prev') pressButton(stageRef.current, 'prev', 'map')
      }}
      onBack={back}
    >
      {/* Pemutar media dirancang terang, jadi tetap terang di tema gelap (bingkai tetap gelap). */}
      {() => (
        <div ref={stageRef} className="min-h-full bg-surface px-4 py-6 text-slate-900">
          <div className="mx-auto max-w-5xl">
            <MediaPlayer
              data={media}
              api={mediaPlayApi}
              materialId={material.id}
              user={user}
              title={media.title}
              onReload={reload}
            />
          </div>
        </div>
      )}
    </PresentationFrame>
  )
}

/**
 * /presentasi/media/:id — Media Interaktif dijalankan guru di TV kelas. Guru/admin = pratinjau
 * (jawaban tidak disimpan), jadi siswa tidak perlu login: guru mengklik jawaban yang disebut siswa.
 */
export default function MediaPresentationPage() {
  const { id } = useParams()
  const info = useFetch(loadPresentation, id)
  const media = useFetch(mediaPlayApi.get, id)
  const error = info.error || media.error
  if (!info.data || !media.data || !info.data.settings.features.presentasi) {
    return <PresentationStatus error={error} featureOff={Boolean(info.data && media.data)} />
  }
  return (
    <Presentation
      material={info.data.material}
      settings={info.data.settings}
      media={media.data}
      reload={media.reload}
    />
  )
}
