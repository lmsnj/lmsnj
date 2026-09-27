export const ROLES = {
  ADMIN: 'admin',
  TEACHER: 'teacher',
  STUDENT: 'student',
}

export const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Admin',
  [ROLES.TEACHER]: 'Guru',
  [ROLES.STUDENT]: 'Siswa',
}

// Halaman awal tiap peran setelah login.
export const ROLE_HOME = {
  [ROLES.ADMIN]: '/admin',
  [ROLES.TEACHER]: '/guru',
  [ROLES.STUDENT]: '/siswa',
}

export const NAV_ITEMS = {
  [ROLES.ADMIN]: [
    { to: '/admin', label: 'Dashboard', end: true },
    { to: '/admin/pengguna', label: 'Pengguna' },
    { to: '/admin/kelas', label: 'Kelas' },
    { to: '/admin/mapel', label: 'Mata Pelajaran' },
    { to: '/admin/pengampu', label: 'Pengampu' },
  ],
  [ROLES.TEACHER]: [
    { to: '/guru', label: 'Dashboard', end: true },
    { to: '/guru/kelas', label: 'Kelas Saya' },
  ],
  [ROLES.STUDENT]: [
    { to: '/siswa', label: 'Dashboard', end: true },
    { to: '/siswa/mapel', label: 'Mapel Saya' },
  ],
}

export const PAGE_SIZE = 20

// Batas ukuran upload; harus sama dengan MAX_UPLOAD_SIZE_MB di backend.
export const MAX_UPLOAD_MB = 10

export const MATERIAL_TYPES = {
  pdf: { label: 'PDF', color: 'red' },
  video: { label: 'Video', color: 'blue' },
  link: { label: 'Link', color: 'gray' },
}

// Tipe file untuk lampiran tugas & jawaban siswa; harus sama dengan ALLOWED_TASK_EXTENSIONS di backend.
export const TASK_FILE_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.7z,.jpg,.jpeg,.png'
