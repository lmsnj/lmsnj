import useAuth from '../hooks/useAuth'
import { ROLE_LABELS } from '../utils/constants'

// Sementara dipakai di dashboard. Isi dashboard lengkap dikerjakan di Fase 6.
export default function WelcomeCard({ children }) {
  const { user } = useAuth()
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">Selamat datang,</p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">{user.full_name}</h1>
      <p className="mt-1 text-sm text-brand-700">{ROLE_LABELS[user.role]}</p>
      {children && <div className="mt-4 text-sm text-slate-600">{children}</div>}
    </div>
  )
}
