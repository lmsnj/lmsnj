import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullPageSpinner } from '../components/Spinner'
import useAuth from '../hooks/useAuth'
import { ROLE_HOME } from '../utils/constants'

// Tanpa `roles`: cukup sudah login. Dengan `roles`: peran user harus termasuk di dalamnya.
export default function ProtectedRoute({ roles }) {
  const { user, initializing } = useAuth()
  const location = useLocation()

  if (initializing) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (roles && !roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]} replace />

  return <Outlet />
}
