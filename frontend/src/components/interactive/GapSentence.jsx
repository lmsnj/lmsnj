import { Fragment } from 'react'
import RichText from '../RichText'

/**
 * Kalimat rumpang: potongan teks (boleh berisi rumus/teks Arab) dengan celah di antaranya.
 * `renderGap(index)` menggambar isi celah ke-index (kotak isian, tempat menaruh pilihan, dll.).
 */
export default function GapSentence({ parts, dir = 'auto', renderGap }) {
  return (
    <p dir={dir} className="leading-[2.6]">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part && <RichText text={part} dir={dir} as="span" />}
          {index < parts.length - 1 && renderGap(index)}
        </Fragment>
      ))}
    </p>
  )
}
