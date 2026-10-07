import api from './client'

// Status pembayaran siswa (lunas sampai triwulan ke-N), khusus admin.
// Impor Excel memakai adminImportApi dengan kind 'payments' (api/academics.js).
export const paymentsApi = {
  list: (classroomId) =>
    api.get('/payments/', { params: { classroom: classroomId } }).then((res) => res.data),
  // records: [{ student, paid_quarter (0-4), note }]
  save: (academicYear, records) =>
    api.put('/payments/', { academic_year: academicYear, records }).then((res) => res.data),
}
