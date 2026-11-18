// Identitas BAWAAN (dipakai sebelum data dari server termuat atau jika gagal dimuat).
// Nilai sebenarnya: identitas aplikasi (menu "Identitas Aplikasi") dan identitas tiap
// sekolah (menu "Identitas Sekolah") — lihat context/BrandingProvider.jsx.
export const SCHOOL = {
  name: 'Sigma Teknologi',
  slogan: '',
  app: 'LMS Sigma',
}

export const ROLES = {
  FOUNDATION: 'foundation',
  ADMIN: 'admin',
  TEACHER: 'teacher',
  STUDENT: 'student',
}

export const ROLE_LABELS = {
  [ROLES.FOUNDATION]: 'Super Admin',
  [ROLES.ADMIN]: 'Admin',
  [ROLES.TEACHER]: 'Guru',
  [ROLES.STUDENT]: 'Siswa',
}

// Halaman awal tiap peran setelah login. Admin yayasan memakai halaman admin (di sekolah yang
// sedang dibuka) ditambah menu Daftar Sekolah.
export const ROLE_HOME = {
  [ROLES.FOUNDATION]: '/admin',
  [ROLES.ADMIN]: '/admin',
  [ROLES.TEACHER]: '/guru',
  [ROLES.STUDENT]: '/siswa',
}

// Peran yang boleh membuka halaman admin.
export const ADMIN_ROLES = [ROLES.ADMIN, ROLES.FOUNDATION]
export const isAdminRole = (role) => ADMIN_ROLES.includes(role)

// Jenjang sekolah; harus sama dengan Level di backend (apps/schools/models.py).
export const SCHOOL_LEVELS = [
  { value: 'sd', label: 'SD' },
  { value: 'mi', label: 'MI' },
  { value: 'smp', label: 'SMP' },
  { value: 'mts', label: 'MTs' },
  { value: 'sma', label: 'SMA' },
  { value: 'ma', label: 'MA' },
  { value: 'smk', label: 'SMK' },
]

export const PAGE_SIZE = 20

// Batas ukuran upload; harus sama dengan MAX_UPLOAD_SIZE_MB di backend.
export const MAX_UPLOAD_MB = 10
// Batas video soal video interaktif. Samakan dengan MAX_VIDEO_UPLOAD_MB di backend/.env.
export const MAX_VIDEO_UPLOAD_MB = 100

export const MATERIAL_TYPES = {
  pdf: { label: 'PDF', color: 'red' },
  video: { label: 'Video', color: 'blue' },
  link: { label: 'Link', color: 'gray' },
  media: { label: 'Media Interaktif', color: 'green' },
}

// Jenis konten yang diunggah/ditautkan langsung (konten tambahan tidak boleh berupa media interaktif).
export const CONTENT_TYPES = Object.fromEntries(
  Object.entries(MATERIAL_TYPES).filter(([value]) => value !== 'media'),
)

// Tipe file untuk lampiran tugas & jawaban siswa; harus sama dengan ALLOWED_TASK_EXTENSIONS di backend.
export const TASK_FILE_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.7z,.jpg,.jpeg,.png'

// Garis lengkung hiasan di latar kartu/header kelas (warna putih transparan, bukan gambar).
export const STRIPES =
  'bg-[repeating-linear-gradient(115deg,transparent_0_28px,rgb(255_255_255/0.55)_28px_40px)]'
