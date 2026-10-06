import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import AuthProvider from './context/AuthProvider'
import BrandingProvider from './context/BrandingProvider'
import AppRoutes from './routes/AppRoutes'

// "Data router" dipakai agar fitur seperti useBlocker (mencegah meninggalkan halaman ujian)
// bisa berjalan. Semua route tetap didefinisikan di routes/AppRoutes.jsx.
const router = createBrowserRouter([
  {
    path: '*',
    element: (
      // Identitas yang tampil mengikuti sekolah yang sedang dibuka, jadi Branding di dalam Auth.
      <AuthProvider>
        <BrandingProvider>
          <AppRoutes />
        </BrandingProvider>
      </AuthProvider>
    ),
  },
])

export default function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  )
}
