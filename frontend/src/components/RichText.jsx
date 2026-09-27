import katex from 'katex'
import 'katex/dist/katex.min.css'
import { Fragment, memo } from 'react'
import { parseBlocks, parseEmphasis, parseRichText, splitArabic } from '../utils/richText'

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

function ArabicRuns({ value }) {
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

const EMPHASIS_TAGS = { em: 'em', strong: 'strong' }

function PlainText({ value }) {
  return parseEmphasis(value).map((part, index) => {
    const Tag = EMPHASIS_TAGS[part.type]
    return Tag ? (
      <Tag key={index}>
        <ArabicRuns value={part.value} />
      </Tag>
    ) : (
      <ArabicRuns key={index} value={part.value} />
    )
  })
}

// Satu baris/paragraf: rumus + teks (miring/tebal, Arab).
function Inline({ text }) {
  return parseRichText(text).map((part, index) =>
    part.type === 'math' ? (
      <MathFormula key={index} value={part.value} display={part.display} />
    ) : (
      <PlainText key={index} value={part.value} />
    ),
  )
}

// Tabel soal bergaya lembar ujian: judul merah marun (serif tebal), sub-judul merah muda.
function RichTable({ table }) {
  const cell = 'border border-slate-800 px-3 py-2'
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse border-2 border-slate-800 text-center">
        <thead>
          {table.head.map((row, r) => (
            <tr
              key={r}
              className={
                r === 0 ? 'bg-red-900 font-serif font-bold text-white' : 'bg-red-100 text-red-950'
              }
            >
              {row.map((c, i) => (
                <th key={i} colSpan={c.colSpan} className={`${cell} ${r ? 'font-semibold' : ''}`}>
                  <Inline text={c.text} />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.body.map((row, r) => (
            <tr key={r} className="bg-white">
              {row.map((c, i) => (
                <td key={i} colSpan={c.colSpan} className={cell}>
                  <Inline text={c.text} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Tampilkan teks soal: rumus LaTeX ($...$, $$...$$) dengan KaTeX, teks Arab (font Naskh, lebih
 * besar, kanan-ke-kiri), *miring*, **tebal**, paragraf (dipisah baris kosong), dan tabel "| a | b |".
 * `dir`: 'auto' (bawaan: arah mengikuti huruf pertama), 'rtl', 'ltr'.
 */
function RichText({ text, dir = 'auto', as: Tag = 'div', className = '' }) {
  const blocks = text ? parseBlocks(text) : []
  if (!blocks.length) return null
  if (blocks.length === 1 && blocks[0].type === 'paragraph') {
    return (
      <Tag dir={dir} className={`whitespace-pre-line ${className}`}>
        <Inline text={blocks[0].text} />
      </Tag>
    )
  }
  return (
    <div dir={dir} className={`space-y-[0.9em] ${className}`}>
      {blocks.map((block, index) =>
        block.type === 'table' ? (
          <RichTable key={index} table={block} />
        ) : (
          <p key={index} className="whitespace-pre-line">
            <Inline text={block.text} />
          </p>
        ),
      )}
    </div>
  )
}

export default memo(RichText)
