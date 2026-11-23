import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { FullPageSpinner } from '../components/Spinner'
import useAuth from '../hooks/useAuth'
import DashboardLayout from '../layouts/DashboardLayout'
import LoginPage from '../pages/auth/LoginPage'
import { ADMIN_ROLES, ROLE_HOME, ROLES } from '../utils/constants'
import ProtectedRoute from './ProtectedRoute'

// Setiap halaman dimuat saat pertama kali dibuka (code splitting), agar unduhan awal kecil
// untuk internet sekolah yang lambat. Tampilan "memuat" diatur oleh <Suspense> di layout.
const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'))
const FoundationDashboard = lazy(() => import('../pages/admin/FoundationDashboard'))
const AssignmentsPage = lazy(() => import('../pages/admin/AssignmentsPage'))
const BrandingPage = lazy(() => import('../pages/admin/BrandingPage'))
const PromotionPage = lazy(() => import('../pages/admin/PromotionPage'))
const PaymentsPage = lazy(() => import('../pages/admin/PaymentsPage'))
const SchoolsPage = lazy(() => import('../pages/admin/SchoolsPage'))
const ImpersonatePage = lazy(() => import('../pages/admin/ImpersonatePage'))
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
const AttendanceReportPage = lazy(() => import('../pages/AttendanceReportPage'))
const StudentAttendancePage = lazy(() => import('../pages/siswa/StudentAttendancePage'))
const ExamsPage = lazy(() => import('../pages/ExamsPage'))
const ExamEventPage = lazy(() => import('../pages/ExamEventPage'))
const ExamCardsPrintPage = lazy(() => import('../pages/ExamCardsPrintPage'))
const AccountCardsPrintPage = lazy(() => import('../pages/AccountCardsPrintPage'))
const ChatPage = lazy(() => import('../pages/ChatPage'))
const MediaPlayerPage = lazy(() => import('../pages/MediaPlayerPage'))
const MediaReportPage = lazy(() => import('../pages/MediaReportPage'))
const MediaLibraryPage = lazy(() => import('../pages/MediaLibraryPage'))
const MediaStudioPage = lazy(() => import('../pages/MediaStudioPage'))
const MediaSummaryPrintPage = lazy(() => import('../pages/MediaSummaryPrintPage'))
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'))
const ReportPage = lazy(() => import('../pages/ReportPage'))
const StatisticsPage = lazy(() => import('../pages/admin/StatisticsPage'))
const SessionsPage = lazy(() => import('../pages/SessionsPage'))
const TimetablePage = lazy(() => import('../pages/TimetablePage'))
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

// Beranda /admin: admin yayasan di mode yayasan melihat ringkasan semua sekolah; admin sekolah
// (dan admin yayasan yang sedang membuka sebuah sekolah) melihat Beranda sekolah itu.
function AdminHome() {
  const { user, school } = useAuth()
  return user.role === ROLES.FOUNDATION && !school ? <FoundationDashboard /> : <AdminDashboard />
}

// Halaman data satu sekolah. Admin yayasan yang belum membuka sekolah diarahkan ke Beranda.
function SchoolRoute() {
  const { user, school } = useAuth()
  if (user.role === ROLES.FOUNDATION && !school) return <Navigate to="/admin" replace />
  return <Outlet />
}

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
          {/* Halaman cetak tanpa header & menu agar hasil cetaknya bersih. */}
          <Route element={<ProtectedRoute roles={[...ADMIN_ROLES, ROLES.TEACHER]} />}>
            <Route element={<SchoolRoute />}>
              <Route path="cetak/kartu-ujian/:id" element={<ExamCardsPrintPage />} />
            </Route>
          </Route>
          <Route element={<ProtectedRoute roles={ADMIN_ROLES} />}>
            <Route element={<SchoolRoute />}>
              <Route path="cetak/kartu-akun" element={<AccountCardsPrintPage />} />
            </Route>
          </Route>
          <Route element={<SchoolRoute />}>
            <Route path="cetak/ringkasan-media/:id" element={<MediaSummaryPrintPage />} />
          </Route>
          <Route element={<DashboardLayout />}>
            <Route path="admin" element={<ProtectedRoute roles={ADMIN_ROLES} />}>
              <Route index element={<AdminHome />} />
              <Route path="identitas" element={<BrandingPage />} />
              {/* Mode Super Admin = Pustaka Media global; di sekolah = media sekolah itu. */}
              <Route path="media-interaktif" element={<MediaLibraryPage />} />
              <Route path="media-interaktif/:id" element={<MediaStudioPage />} />
              <Route element={<SchoolRoute />}>
                <Route path="pengguna" element={<UsersPage />} />
                <Route path="kelas" element={<ClassroomsPage />} />
                <Route path="kelas/:id" element={<ClassroomDetailPage />} />
                <Route path="mapel" element={<SubjectsPage />} />
                <Route path="pengampu" element={<AssignmentsPage />} />
                <Route path="jadwal" element={<TimetablePage />} />
                <Route path="laporan" element={<ReportPage />} />
                <Route path="statistik" element={<StatisticsPage />} />
                <Route path="presensi" element={<AttendanceReportPage />} />
                <Route path="pembayaran" element={<PaymentsPage />} />
                <Route path="ujian" element={<ExamsPage />} />
                <Route path="ujian/:id" element={<ExamEventPage />} />
                <Route path="tahun-ajaran" element={<PromotionPage />} />
                <Route path="media/:id" element={<MediaPlayerPage />} />
                <Route path="media/:id/laporan" element={<MediaReportPage />} />
              </Route>
              <Route element={<ProtectedRoute roles={[ROLES.FOUNDATION]} />}>
                <Route path="sekolah" element={<SchoolsPage />} />
                <Route path="masuk-sebagai" element={<ImpersonatePage />} />
              </Route>
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
              <Route path="media/:id" element={<MediaPlayerPage />} />
              <Route path="media/:id/laporan" element={<MediaReportPage />} />
              <Route path="media-interaktif" element={<MediaLibraryPage />} />
              <Route path="media-interaktif/:id" element={<MediaStudioPage />} />
              <Route path="jadwal" element={<TimetablePage />} />
              <Route path="sesi" element={<SessionsPage />} />
              <Route path="laporan" element={<ReportPage />} />
              <Route path="presensi" element={<AttendanceReportPage />} />
              <Route path="ujian" element={<ExamsPage />} />
              <Route path="ujian/:id" element={<ExamEventPage />} />
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
              <Route path="media/:id" element={<MediaPlayerPage />} />
              <Route path="jadwal" element={<TimetablePage />} />
              <Route path="sesi" element={<SessionsPage />} />
              <Route path="presensi" element={<StudentAttendancePage />} />
            </Route>

            <Route path="profil" element={<ProfilePage />} />
            {/* Halaman bersama semua peran (isi & hak akses menyesuaikan peran). */}
            <Route element={<SchoolRoute />}>
              <Route path="pengumuman" element={<AnnouncementsPage />} />
            </Route>
            <Route path="obrolan" element={<ChatPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
