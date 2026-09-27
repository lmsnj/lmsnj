import { Navigate, Route, Routes } from 'react-router-dom'
import { FullPageSpinner } from '../components/Spinner'
import useAuth from '../hooks/useAuth'
import DashboardLayout from '../layouts/DashboardLayout'
import AdminDashboard from '../pages/admin/AdminDashboard'
import AssignmentsPage from '../pages/admin/AssignmentsPage'
import ClassroomDetailPage from '../pages/admin/ClassroomDetailPage'
import ClassroomsPage from '../pages/admin/ClassroomsPage'
import SubjectsPage from '../pages/admin/SubjectsPage'
import UsersPage from '../pages/admin/UsersPage'
import LoginPage from '../pages/auth/LoginPage'
import MyClassesPage from '../pages/guru/MyClassesPage'
import TeacherClassPage from '../pages/guru/TeacherClassPage'
import TeacherDashboard from '../pages/guru/TeacherDashboard'
import TeacherMaterialsPage from '../pages/guru/TeacherMaterialsPage'
import TeacherTasksPage from '../pages/guru/TeacherTasksPage'
import TeacherTaskPage from '../pages/guru/TeacherTaskPage'
import NotFoundPage from '../pages/NotFoundPage'
import ProfilePage from '../pages/ProfilePage'
import MySubjectsPage from '../pages/siswa/MySubjectsPage'
import StudentDashboard from '../pages/siswa/StudentDashboard'
import StudentGradesPage from '../pages/siswa/StudentGradesPage'
import StudentMaterialsPage from '../pages/siswa/StudentMaterialsPage'
import StudentSubjectPage from '../pages/siswa/StudentSubjectPage'
import StudentTaskPage from '../pages/siswa/StudentTaskPage'
import StudentTasksPage from '../pages/siswa/StudentTasksPage'
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
            <Route path="kelas" element={<ClassroomsPage />} />
            <Route path="kelas/:id" element={<ClassroomDetailPage />} />
            <Route path="mapel" element={<SubjectsPage />} />
            <Route path="pengampu" element={<AssignmentsPage />} />
          </Route>

          <Route path="guru" element={<ProtectedRoute roles={[ROLES.TEACHER]} />}>
            <Route index element={<TeacherDashboard />} />
            <Route path="kelas" element={<MyClassesPage />} />
            <Route path="kelas/:id" element={<TeacherClassPage />} />
            <Route path="materi" element={<TeacherMaterialsPage />} />
            <Route path="tugas" element={<TeacherTasksPage />} />
            <Route path="tugas/:id" element={<TeacherTaskPage />} />
          </Route>

          <Route path="siswa" element={<ProtectedRoute roles={[ROLES.STUDENT]} />}>
            <Route index element={<StudentDashboard />} />
            <Route path="mapel" element={<MySubjectsPage />} />
            <Route path="mapel/:id" element={<StudentSubjectPage />} />
            <Route path="materi" element={<StudentMaterialsPage />} />
            <Route path="tugas" element={<StudentTasksPage />} />
            <Route path="tugas/:id" element={<StudentTaskPage />} />
            <Route path="nilai" element={<StudentGradesPage />} />
          </Route>

          <Route path="profil" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
