import { questionDir } from '../utils/assessments'
import AuthImage from './AuthImage'
import RichText from './RichText'

/**
 * Isi soal yang dipakai di editor guru, pratinjau impor, halaman ujian siswa, hasil, dan penilaian —
 * agar tampilannya selalu sama. `imageNames` (opsional, untuk pratinjau impor): nama file gambar
 * yang belum diunggah.
 */

// Stimulus (bacaan/tabel/gambar). `label` opsional, mis. "Stimulus untuk soal nomor 5–7".
export function Stimulus({ question, imageNames, label, className = '' }) {
  const images = question.images ?? {}
  if (!question.stimulus && !images.stimulus && !imageNames?.stimulus) return null
  return (
    <div className={`rounded-lg bg-slate-50 p-3 text-slate-700 ring-1 ring-slate-200 ${className}`}>
      {label && (
        <p className="mb-2 text-[0.8em] font-semibold tracking-wide text-slate-500 uppercase">
          {label}
        </p>
      )}
      <RichText text={question.stimulus} dir={questionDir(question)} />
      {images.stimulus && (
        <AuthImage url={images.stimulus.url} alt="Gambar stimulus" className="mt-2 max-h-96" />
      )}
      {imageNames?.stimulus && <ImageName name={imageNames.stimulus} />}
    </div>
  )
}

// Pertanyaan + gambar soal.
export function QuestionText({ question, number, imageNames, className = '' }) {
  const images = question.images ?? {}
  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex gap-2">
        {number && <span className="shrink-0">{number}.</span>}
        <RichText text={question.text} dir={questionDir(question)} className="min-w-0 flex-1" />
      </div>
      {images.question && (
        <AuthImage url={images.question.url} alt="Gambar soal" className="max-h-96" />
      )}
      {imageNames?.question && <ImageName name={imageNames.question} />}
    </div>
  )
}

/**
 * Stimulus + pertanyaan. `shared` (opsional, dari utils/exam.js sharedStimuli): stimulus bersama
 * soal grup, ditampilkan jika soal ini bukan pemilik stimulusnya.
 */
export function QuestionBody({ question, number, imageNames, shared }) {
  const showShared = shared && shared.source.id !== question.id
  return (
    <div className="space-y-3">
      {showShared && (
        <Stimulus
          question={shared.source}
          label={`Stimulus soal nomor ${shared.from}–${shared.to}`}
        />
      )}
      <Stimulus question={question} imageNames={imageNames} />
      <QuestionText
        question={question}
        number={number}
        imageNames={imageNames}
        className="font-medium text-slate-900"
      />
    </div>
  )
}

// Isi satu pilihan jawaban / pernyataan kategori (teks + gambar bila ada).
export function ChoiceContent({ question, index, imageName }) {
  const image = question.images?.choices?.[index]
  return (
    <span className="block min-w-0 flex-1 space-y-1">
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
