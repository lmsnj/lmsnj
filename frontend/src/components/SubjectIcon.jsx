import { subjectStyle } from '../utils/subjectStyles'

// Kotak ikon mapel berwarna. `size`: 'sm' (untuk teks), 'md', atau 'lg'.
const SIZES = {
  sm: { box: 'size-6 rounded-md', icon: 'size-3.5' },
  md: { box: 'size-10 rounded-xl', icon: 'size-5' },
  lg: { box: 'size-16 rounded-2xl', icon: 'size-8' },
}

export default function SubjectIcon({ name, size = 'sm', className = '' }) {
  const style = subjectStyle(name)
  const Icon = style.icon
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center text-white ${style.tile} ${SIZES[size].box} ${className}`}
    >
      <Icon className={SIZES[size].icon} />
    </span>
  )
}
