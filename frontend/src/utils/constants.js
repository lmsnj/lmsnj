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
  ],
  [ROLES.TEACHER]: [{ to: '/guru', label: 'Dashboard', end: true }],
  [ROLES.STUDENT]: [{ to: '/siswa', label: 'Dashboard', end: true }],
}

export const PAGE_SIZE = 20
