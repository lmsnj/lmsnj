import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { FullPageSpinner } from '../components/Spinner'
import useAuth from '../hooks/useAuth'
import DashboardLayout from '../layouts/DashboardLayout'
import LoginPage from '../pages/auth/LoginPage'
import { ROLE_HOME, ROLES } from '../utils/constants'
import ProtectedRoute from './ProtectedRoute'

// Setiap halaman dimuat saat pertama kali dibuka (code splitting), agar unduhan awal kecil
// untuk internet sekolah yang lambat. Tampilan "memuat" diatur oleh <Suspense> di layout.
const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'))
const AssignmentsPage = lazy(() => import('../pages/admin/AssignmentsPage'))
const BrandingPage = lazy(() => import('../pages/admin/BrandingPage'))
const PromotionPage = lazy(() => import('../pages/admin/PromotionPage'))
const ClassroomDetailPage = lazy(() => import('../pages/admin/ClassroomDetailPage'))
const ClassroomsPage = lazy(() => import('../pages/admin/ClassroomsPage'))
const SubjectsPage = lazy(() => import('../pages/admin/SubjectsPage'))
const UsersPage = lazy(() => import('../pages/admin/UsersPage'))
const MyClassesPage = lazy(() => import('../pages/guru/MyClassesPage'))
const TeacherClassPage = lazy(() => import('../pages/guru/TeacherClassPage'))
const TeacherDashboard = lazy(() => import('../pages/guru/TeacherDashboard'))
const TeacherMaterialsPage = lazy(() => import('../pages/guru/TeacherMaterialsPage'))
const TeacherTasksPage = lazy(() => import('../pages/guru/TeacherTasksPage'))
const TeacherTaskPage = lazy(() => import('../pages/guru/TeacherTaskPage'))
const AnnouncementsPage = lazy(() => import('../pages/AnnouncementsPage'))
const ChatPage = lazy(() => import('../pages/ChatPage'))
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'))
const ReportPage = lazy(() => import('../pages/ReportPage'))
const SessionsPage = lazy(() => import('../pages/SessionsPage'))
const AssessmentEditorPage = lazy(() => import('../pages/guru/AssessmentEditorPage'))
const TeacherAssessmentsPage = lazy(() => import('../pages/guru/TeacherAssessmentsPage'))
const StudentAssessmentPage = lazy(() => import('../pages/siswa/StudentAssessmentPage'))
const StudentAssessmentsPage = lazy(() => import('../pages/siswa/StudentAssessmentsPage'))
const ProfilePage = lazy(() => import('../pages/ProfilePage'))
const MySubjectsPage = lazy(() => import('../pages/siswa/MySubjectsPage'))
const StudentDashboard = lazy(() => import('../pages/siswa/StudentDashboard'))
const StudentGradesPage = lazy(() => import('../pages/siswa/StudentGradesPage'))
const StudentMaterialsPage = lazy(() => import('../pages/siswa/StudentMaterialsPage'))
const StudentSubjectPage = lazy(() => import('../pages/siswa/StudentSubjectPage'))
const StudentTaskPage = lazy(() => import('../pages/siswa/StudentTaskPage'))
const StudentTasksPage = lazy(() => import('../pages/siswa/StudentTasksPage'))

function HomeRedirect() {
  const { user, initializing } = useAuth()
  if (initializing) return <FullPageSpinner />
  return <Navigate to={user ? ROLE_HOME[user.role] : '/login'} replace />
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
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
              <Route path="laporan" element={<ReportPage />} />
              <Route path="identitas" element={<BrandingPage />} />
              <Route path="tahun-ajaran" element={<PromotionPage />} />
            </Route>

            <Route path="guru" element={<ProtectedRoute roles={[ROLES.TEACHER]} />}>
              <Route index element={<TeacherDashboard />} />
              <Route path="kelas" element={<MyClassesPage />} />
              <Route path="kelas/:id" element={<TeacherClassPage />} />
              <Route path="materi" element={<TeacherMaterialsPage />} />
              <Route path="tugas" element={<TeacherTasksPage />} />
              <Route path="tugas/:id" element={<TeacherTaskPage />} />
              <Route path="asesmen" element={<TeacherAssessmentsPage />} />
              <Route path="asesmen/:id" element={<AssessmentEditorPage />} />
              <Route path="sesi" element={<SessionsPage />} />
              <Route path="laporan" element={<ReportPage />} />
            </Route>

            <Route path="siswa" element={<ProtectedRoute roles={[ROLES.STUDENT]} />}>
              <Route index element={<StudentDashboard />} />
              <Route path="mapel" element={<MySubjectsPage />} />
              <Route path="mapel/:id" element={<StudentSubjectPage />} />
              <Route path="materi" element={<StudentMaterialsPage />} />
              <Route path="tugas" element={<StudentTasksPage />} />
              <Route path="tugas/:id" element={<StudentTaskPage />} />
              <Route path="nilai" element={<StudentGradesPage />} />
              <Route path="asesmen" element={<StudentAssessmentsPage />} />
              <Route path="asesmen/:id" element={<StudentAssessmentPage />} />
              <Route path="sesi" element={<SessionsPage />} />
            </Route>

            <Route path="profil" element={<ProfilePage />} />
            {/* Halaman bersama semua peran (isi & hak akses menyesuaikan peran). */}
            <Route path="pengumuman" element={<AnnouncementsPage />} />
            <Route path="obrolan" element={<ChatPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
