import { useEffect, useRef } from 'react'

// Memanggil `onOutside` saat pengguna mengklik di luar elemen, atau menekan Escape.
// Dipakai untuk menutup menu dropdown.
export default function useClickOutside(active, onOutside) {
  const ref = useRef(null)

  useEffect(() => {
    if (!active) return
    const handlePointer = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onOutside()
    }
    const handleKey = (event) => event.key === 'Escape' && onOutside()
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [active, onOutside])

  return ref
}
