import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="text-5xl font-bold text-brand-600">404</p>
      <h1 className="text-lg font-semibold text-slate-900">Halaman tidak ditemukan</h1>
      <Link to="/" className="text-sm font-medium text-brand-700 hover:underline">
        Kembali ke beranda
      </Link>
    </div>
  )
}
