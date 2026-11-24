import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { loadPresentation } from '../../components/presentation/loadPresentation'
import PresentationFrame from '../../components/presentation/PresentationFrame'
import PresentationStatus from '../../components/presentation/PresentationStatus'
import { ContentSlide, EndSlide, TitleSlide } from '../../components/presentation/Slides'
import useFetch from '../../hooks/useFetch'
import usePresentationBack from '../../hooks/usePresentationBack'
import { buildSlides, moveSlide } from '../../utils/presentation'

function Slide({ slide, material, dark }) {
  if (slide.kind === 'title') return <TitleSlide material={material} dark={dark} />
  if (slide.kind === 'end') return <EndSlide material={material} dark={dark} />
  return <ContentSlide slide={slide} material={material} dark={dark} />
}

function Presentation({ material, settings }) {
  const back = usePresentationBack()
  const slides = buildSlides(material)
  const [index, setIndex] = useState(0)
  const slide = slides[index]

  return (
    <PresentationFrame
      title={material.title}
      subtitle={[material.subject_name, material.classroom_name].filter(Boolean).join(' • ')}
      settings={settings.values}
      counter={`${index + 1} / ${slides.length}`}
      canPrev={index > 0}
      canNext={index < slides.length - 1}
      onAction={(action) => setIndex((value) => moveSlide(value, action, slides.length))}
      onBack={back}
    >
      {/* key: isi slide dibuat ulang saat pindah agar video/PDF lama berhenti. */}
      {({ dark }) => <Slide key={slide.id} slide={slide} material={material} dark={dark} />}
    </PresentationFrame>
  )
}

/** /presentasi/materi/:id — materi tampil penuh di TV kelas (Mapel Umum Tahap 4). */
export default function MaterialPresentationPage() {
  const { id } = useParams()
  const { data, error } = useFetch(loadPresentation, id)
  if (data?.material.material_type === 'media') {
    return <Navigate to={`/presentasi/media/${id}`} replace />
  }
  if (!data || !data.settings.features.presentasi) {
    return <PresentationStatus error={error} featureOff={Boolean(data)} />
  }
  return <Presentation material={data.material} settings={data.settings} />
}
