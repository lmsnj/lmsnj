import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  Lightbulb,
  MessagesSquare,
  School,
  Star,
  Trophy,
  Users,
} from 'lucide-react'
import useAuth from '../../hooks/useAuth'
import useBranding from '../../hooks/useBranding'
import { ROLES } from '../../utils/constants'
import { firstName, longDate, timeGreeting } from '../../utils/greeting'
import PageHero from '../PageHero'
import ActionCard from './ActionCard'
import HomePanel from './HomePanel'

const HERO_ICONS = {
  [ROLES.ADMIN]: [Users, School, BookOpen, CalendarDays, GraduationCap, Star, ClipboardCheck],
  [ROLES.TEACHER]: [BookOpen, ClipboardCheck, Lightbulb, Users, MessagesSquare, Star, Trophy],
  [ROLES.STUDENT]: [
    BookOpen,
    Trophy,
    Lightbulb,
    ClipboardCheck,
    MessagesSquare,
    Star,
    GraduationCap,
  ],
}

/**
 * Bagian atas Beranda yang sama untuk semua peran: banner sapaan, grid 2x2 kartu aksi, panel tab.
 * `stats` (opsional): tambahan baris info di banner, mis. [{ icon, content }] dari data dashboard.
 */
export default function HomeTop({ cards, stats = [] }) {
  const { user } = useAuth()
  const { branding } = useBranding()
  return (
    <div className="space-y-6">
      <PageHero
        title={`Halo, ${firstName(user.full_name)}! 👋`}
        description={`${timeGreeting()}, ${user.full_name}. Apa langkah pertama Anda hari ini?`}
        icons={HERO_ICONS[user.role]}
        centerIcon={GraduationCap}
        stats={[
          { icon: CalendarDays, content: longDate() },
          {
            icon: School,
            content: <strong className="text-white">{branding.school_name}</strong>,
          },
          ...stats,
        ]}
      />
      <div className="grid gap-4 md:grid-cols-2 lg:gap-6">
        {cards.map((card) => (
          <ActionCard key={card.title} card={card} />
        ))}
      </div>
      <HomePanel />
    </div>
  )
}
