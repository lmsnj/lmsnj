import { useEffect, useRef, useState } from 'react'
import { inputClass } from '../TextField'

/**
 * Kolom jawaban matematika. Memakai editor rumus MathLive (pecahan, akar, pangkat seperti ditulis di
 * buku; di HP ada papan ketik rumus). Nilai yang dikirim = bentuk teks ascii-math, mis. "(1)/(2)" atau
 * "sqrt(8)", yang dibaca pembaca rumus di server (math_check.py). Jika MathLive gagal dimuat, kolom teks
 * biasa dipakai (siswa mengetik 1/2, sqrt(8), x^2).
 */
export default function MathAnswerField({ value, onChange, label, disabled = false }) {
  const container = useRef(null)
  const field = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([import('mathlive'), import('mathlive/fonts.css')])
      .then(([{ MathfieldElement }]) => {
        if (cancelled || !container.current) return
        // Font dari mathlive/fonts.css yang dibundel (tetap jalan tanpa internet).
        MathfieldElement.fontsDirectory = null
        MathfieldElement.soundsDirectory = null
        const element = new MathfieldElement()
        element.setAttribute('aria-label', label)
        element.style.width = '100%'
        element.style.fontSize = '1.25rem'
        element.style.padding = '0.25rem 0.5rem'
        element.style.borderRadius = '0.5rem'
        element.style.border = '1px solid rgb(203 213 225)'
        // Jawaban lama ditampilkan apa adanya (ascii-math juga dibaca MathLive).
        if (value) element.setValue(value, { format: 'ascii-math' })
        element.addEventListener('input', () => onChangeRef.current(element.getValue('ascii-math')))
        container.current.appendChild(element)
        field.current = element
      })
      .catch(() => !cancelled && setFallback(true))
    return () => {
      cancelled = true
      field.current?.remove()
    }
    // Editor dibuat sekali; isinya dikendalikan pengguna.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (field.current) field.current.disabled = disabled
  }, [disabled])

  if (fallback) {
    return (
      <input
        type="text"
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="mis. 1/2, sqrt(8), 2x+3"
        className={`${inputClass} ring-slate-300`}
      />
    )
  }
  return <div ref={container} className="min-h-11" />
}
