import { useEffect, useState } from 'react'

// Menunda perubahan nilai, misalnya agar pencarian tidak memanggil API di setiap ketukan.
export default function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
