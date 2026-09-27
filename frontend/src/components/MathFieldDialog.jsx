import { useEffect, useRef, useState } from 'react'
import Alert from './Alert'
import Button from './Button'
import Modal from './Modal'
import RichText from './RichText'
import Spinner from './Spinner'

// Tombol cepat rumus yang sering dipakai di SMK. #0 = isian utama, #? = kotak isian berikutnya.
const TEMPLATES = [
  ['a/b', 'Pecahan', '\\frac{#0}{#?}'],
  ['xⁿ', 'Pangkat', '#@^{#?}'],
  ['xₙ', 'Indeks', '#@_{#?}'],
  ['√', 'Akar', '\\sqrt{#0}'],
  ['ⁿ√', 'Akar pangkat n', '\\sqrt[#?]{#0}'],
  ['log', 'Logaritma', '\\log_{#?} #0'],
  ['sin', 'Sinus', '\\sin #0'],
  ['cos', 'Kosinus', '\\cos #0'],
  ['tan', 'Tangen', '\\tan #0'],
  ['°', 'Derajat', '^\\circ'],
  ['∫', 'Integral', '\\int_{#?}^{#?} #0 \\,dx'],
  ['lim', 'Limit', '\\lim_{x \\to #?} #0'],
  ['Σ', 'Sigma', '\\sum_{i=#?}^{#?} #0'],
  ['[ ]', 'Matriks 2×2', '\\begin{pmatrix} #? & #? \\\\ #? & #? \\end{pmatrix}'],
  ['{', 'Sistem persamaan', '\\begin{cases} #? \\\\ #? \\end{cases}'],
  ['≤', 'Kurang dari sama dengan', '\\le'],
  ['≥', 'Lebih dari sama dengan', '\\ge'],
  ['≠', 'Tidak sama dengan', '\\neq'],
  ['×', 'Kali', '\\times'],
  ['÷', 'Bagi', '\\div'],
  ['±', 'Plus minus', '\\pm'],
  ['π', 'Pi', '\\pi'],
]

/**
 * Editor rumus visual (MathLive). Guru menyusun rumus seperti di kalkulator, lalu hasilnya
 * disisipkan ke teks sebagai LaTeX: $...$ (dalam kalimat) atau $$...$$ (baris sendiri).
 * MathLive baru diunduh saat dialog ini dibuka, agar halaman lain tetap ringan.
 */
export default function MathFieldDialog({ onInsert, onClose }) {
  const container = useRef(null)
  const field = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [display, setDisplay] = useState(false)
  const [latex, setLatex] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([import('mathlive'), import('mathlive/fonts.css')])
      .then(([{ MathfieldElement }]) => {
        if (cancelled || !container.current) return
        // Font MathLive diambil dari mathlive/fonts.css yang dibundel (tetap jalan tanpa internet).
        MathfieldElement.fontsDirectory = null
        MathfieldElement.soundsDirectory = null
        const element = new MathfieldElement()
        element.style.width = '100%'
        element.style.fontSize = '1.5rem'
        element.addEventListener('input', () => setLatex(element.value))
        container.current.appendChild(element)
        field.current = element
        setReady(true)
        requestAnimationFrame(() => element.focus())
      })
      .catch(
        () =>
          !cancelled &&
          setError('Editor rumus gagal dimuat. Anda tetap bisa mengetik LaTeX langsung.'),
      )
    return () => {
      cancelled = true
      field.current?.remove()
    }
  }, [])

  const insertTemplate = (template) => {
    field.current?.executeCommand(['insert', template])
    field.current?.focus()
  }

  const handleInsert = () => {
    const value = (field.current?.value ?? latex).trim()
    if (!value) return onClose()
    onInsert(display ? `$$${value}$$` : `$${value}$`)
  }

  return (
    <Modal
      open
      size="lg"
      title="Sisipkan Rumus"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={handleInsert} disabled={!ready}>
            Sisipkan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert type="error">{error}</Alert>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map(([label, title, template]) => (
            <button
              key={title}
              type="button"
              title={title}
              disabled={!ready}
              onClick={() => insertTemplate(template)}
              className="min-w-10 rounded-lg bg-slate-100 px-2.5 py-1.5 font-serif text-sm text-slate-800 hover:bg-brand-50 hover:text-brand-800 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
        <div
          ref={container}
          dir="ltr"
          className="min-h-16 rounded-lg p-2 ring-1 ring-slate-300 focus-within:ring-2 focus-within:ring-brand-600"
        >
          {!ready && !error && (
            <div className="py-3 text-center text-brand-600">
              <Spinner />
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={display}
            onChange={(event) => setDisplay(event.target.checked)}
            className="size-4 rounded border-slate-300"
          />
          Tampilkan di baris sendiri (rumus besar, mis. sistem persamaan)
        </label>
        {latex && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
            <p className="mb-1 text-xs text-slate-500">
              Pratinjau · LaTeX: <code className="break-all">{latex}</code>
            </p>
            <RichText text={display ? `$$${latex}$$` : `$${latex}$`} />
          </div>
        )}
      </div>
    </Modal>
  )
}
