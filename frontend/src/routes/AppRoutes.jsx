import { Navigate, Route, Routes } from 'react-router-dom'
import { FullPageSpinner } from '../components/Spinner'
import useAuth from '../hooks/useAuth'
import DashboardLayout from '../layouts/DashboardLayout'
import AdminDashboard from '../pages/admin/AdminDashboard'
import UsersPage from '../pages/admin/UsersPage'
import LoginPage from '../pages/auth/LoginPage'
import TeacherDashboard from '../pages/guru/TeacherDashboard'
import NotFoundPage from '../pages/NotFoundPage'
import ProfilePage from '../pages/ProfilePage'
import StudentDashboard from '../pages/siswa/StudentDashboard'
import { ROLE_HOME, ROLES } from '../utils/constants'
import ProtectedRoute from './ProtectedRoute'

function HomeRedirect() {
  const { user, initializing } = useAuth()
  if (initializing) return <FullPageSpinner />
  return <Navigate to={user ? ROLE_HOME[user.role] : '/login'} replace />
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="admin" element={<ProtectedRoute roles={[ROLES.ADMIN]} />}>
            <Route index element={<AdminDashboard />} />
            <Route path="pengguna" element={<UsersPage />} />
          </Route>

          <Route path="guru" element={<ProtectedRoute roles={[ROLES.TEACHER]} />}>
            <Route index element={<TeacherDashboard />} />
          </Route>

          <Route path="siswa" element={<ProtectedRoute roles={[ROLES.STUDENT]} />}>
            <Route index element={<StudentDashboard />} />
          </Route>

          <Route path="profil" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
