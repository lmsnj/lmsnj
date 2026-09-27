import { Link } from 'react-router-dom'
import WelcomeCard from '../../components/WelcomeCard'

export default function AdminDashboard() {
  return (
    <WelcomeCard>
      Kelola akun guru dan siswa melalui menu{' '}
      <Link to="/admin/pengguna" className="font-medium text-brand-700 hover:underline">
        Pengguna
      </Link>
      . Statistik sekolah akan tampil di sini pada tahap berikutnya.
    </WelcomeCard>
  )
}
