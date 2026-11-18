// Tim pengampu: beberapa guru boleh mengajar mapel yang sama di kelas yang sama. Materi, bab, tugas,
// dan asesmen kelas-mapel itu dipakai bersama, jadi siswa cukup melihat satu kartu mapel.

// Nama guru tim (dari API `team_teachers`), cadangan = guru pengampu ini saja.
export function teamTeachers(assignment) {
  return assignment?.team_teachers?.length ? assignment.team_teachers : [assignment?.teacher_name]
}

// Teks nama guru tim, mis. "Siti dan Ahmad" atau "Siti, Ahmad, dan Rudi".
export function teamLabel(assignment) {
  const names = teamTeachers(assignment).filter(Boolean)
  if (names.length <= 2) return names.join(' dan ')
  return `${names.slice(0, -1).join(', ')}, dan ${names.at(-1)}`
}

// Rekan setim (tanpa guru pengampu ini sendiri).
export function teamPartners(assignment) {
  return teamTeachers(assignment).filter((name) => name && name !== assignment?.teacher_name)
}

// Satu pengampu per kelas-mapel (pengampu pertama yang muncul), urutan daftar dipertahankan.
export function uniqueClassSubjects(assignments = []) {
  const seen = new Set()
  return assignments.filter((a) => {
    const key = `${a.classroom}-${a.subject}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
