import useAuth from '../../hooks/useAuth'
import ActionCard from './ActionCard'
import HomePanel from './HomePanel'

// Bagian atas Beranda yang sama untuk semua peran: sapaan, grid 2x2 kartu aksi, panel tab.
export default function HomeTop({ cards }) {
  const { user } = useAuth()
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
        Halo, {user.full_name}! <span className="text-slate-500">Apa langkah pertama Anda?</span>
      </h1>
      <div className="grid gap-4 md:grid-cols-2 lg:gap-6">
        {cards.map((card) => (
          <ActionCard key={card.title} card={card} />
        ))}
      </div>
      <HomePanel />
    </div>
  )
}
