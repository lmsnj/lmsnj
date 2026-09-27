import katex from 'katex'
import 'katex/dist/katex.min.css'
import { Fragment, memo } from 'react'
import { parseRichText, splitArabic } from '../utils/richText'

function MathFormula({ value, display }) {
  // throwOnError=false: rumus yang salah ketik tampil merah, tidak membuat halaman error.
  // trust=false (bawaan): perintah berbahaya seperti \href tidak dijalankan.
  const html = katex.renderToString(value, {
    displayMode: display,
    throwOnError: false,
    strict: 'ignore',
    output: 'html',
  })
  const Tag = display ? 'div' : 'span'
  return (
    <Tag
      dir="ltr"
      className={display ? 'my-2 overflow-x-auto [unicode-bidi:isolate]' : '[unicode-bidi:isolate]'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function PlainText({ value }) {
  return splitArabic(value).map((run, index) =>
    run.arabic ? (
      <span key={index} lang="ar" dir="rtl" className="arabic-text">
        {run.value}
      </span>
    ) : (
      <Fragment key={index}>{run.value}</Fragment>
    ),
  )
}

/**
 * Tampilkan teks soal: rumus LaTeX ($...$, $$...$$) dengan KaTeX dan teks Arab (font Naskh,
 * lebih besar, kanan-ke-kiri). `dir`: 'auto' (bawaan: arah mengikuti huruf pertama), 'rtl', 'ltr'.
 */
function RichText({ text, dir = 'auto', as: Tag = 'div', className = '' }) {
  if (!text) return null
  return (
    <Tag dir={dir} className={`whitespace-pre-line ${className}`}>
      {parseRichText(text).map((part, index) =>
        part.type === 'math' ? (
          <MathFormula key={index} value={part.value} display={part.display} />
        ) : (
          <PlainText key={index} value={part.value} />
        ),
      )}
    </Tag>
  )
}

export default memo(RichText)
