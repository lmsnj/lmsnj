import { Undo2, UserRoundCheck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Spinner from '../components/Spinner'
import useAuth from '../hooks/useAuth'
import { ROLE_LABELS } from '../utils/constants'

// Pita kuning di paling atas selama admin yayasan "masuk sebagai" pengguna lain, agar ia selalu
// sadar sedang memakai akun orang lain, dan bisa kembali ke akunnya dengan satu klik.
export default function ImpersonationBanner() {
  const { user, stopImpersonating } = useAuth()
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)
  if (!user.impersonator) return null

  const leave = async () => {
    setLeaving(true)
    const admin = await stopImpersonating()
    // Kembali ke halaman "Masuk sebagai" agar mudah memilih akun berikutnya.
    navigate(admin ? '/admin/masuk-sebagai' : '/login', { replace: true })
  }

  return (
    <div className="bg-amber-400 text-amber-950">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm sm:px-8">
        <UserRoundCheck className="size-5 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          Anda masuk sebagai <strong>{user.full_name}</strong> ({ROLE_LABELS[user.role]}). Semua
          tindakan tercatat atas nama akun ini.
        </p>
        <button
          type="button"
          onClick={leave}
          disabled={leaving}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-950 px-3 py-1.5 font-semibold text-white transition hover:bg-black disabled:opacity-60"
        >
          {leaving ? (
            <Spinner className="size-4" />
          ) : (
            <Undo2 className="size-4" aria-hidden="true" />
          )}
          Kembali ke {user.impersonator.full_name}
        </button>
      </div>
    </div>
  )
}
