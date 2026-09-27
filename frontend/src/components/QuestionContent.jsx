import { questionDir } from '../utils/assessments'
import AuthImage from './AuthImage'
import RichText from './RichText'

/**
 * Stimulus (bacaan/gambar) + pertanyaan + gambar soal. Dipakai di editor guru, pratinjau impor,
 * halaman ujian siswa, hasil, dan penilaian — agar tampilannya selalu sama.
 * `imageNames` (opsional, untuk pratinjau impor): nama file gambar yang belum diunggah.
 */
export function QuestionBody({ question, number, imageNames }) {
  const dir = questionDir(question)
  const images = question.images ?? {}
  return (
    <div className="space-y-3">
      {(question.stimulus || images.stimulus || imageNames?.stimulus) && (
        <div className="rounded-lg bg-slate-50 p-3 text-slate-700 ring-1 ring-slate-200">
          <RichText text={question.stimulus} dir={dir} />
          {images.stimulus && (
            <AuthImage url={images.stimulus.url} alt="Gambar stimulus" className="mt-2 max-h-80" />
          )}
          {imageNames?.stimulus && <ImageName name={imageNames.stimulus} />}
        </div>
      )}
      <div className="flex gap-2 font-medium text-slate-900">
        {number && <span className="shrink-0">{number}.</span>}
        <RichText text={question.text} dir={dir} className="min-w-0 flex-1" />
      </div>
      {images.question && (
        <AuthImage url={images.question.url} alt="Gambar soal" className="max-h-80" />
      )}
      {imageNames?.question && <ImageName name={imageNames.question} />}
    </div>
  )
}

// Isi satu pilihan jawaban (teks + gambar pilihan bila ada).
export function ChoiceContent({ question, index, imageName }) {
  const image = question.images?.choices?.[index]
  return (
    <span className="min-w-0 flex-1 space-y-1">
      <RichText
        text={question.choices[index]}
        dir={questionDir(question)}
        as="span"
        className="block"
      />
      {image && (
        <AuthImage url={image.url} alt={`Gambar pilihan ${index + 1}`} className="max-h-40" />
      )}
      {imageName && <ImageName name={imageName} />}
    </span>
  )
}

function ImageName({ name }) {
  return (
    <span className="mt-1 inline-flex rounded bg-sky-50 px-2 py-0.5 text-xs text-sky-800">
      🖼 {name}
    </span>
  )
}
