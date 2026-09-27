// Pilihan data untuk tab "Ringkasan" halaman kelas. Fungsi murni agar mudah diuji.

/** Tugas untuk panel "Daftar Tugas": yang belum lewat tenggat dulu (terdekat lebih dulu),
 *  lalu yang sudah lewat (terbaru lebih dulu). */
export function pickTasks(tasks, now = new Date(), limit = 4) {
  const time = (task) => new Date(task.due_at).getTime()
  const list = tasks ?? []
  const upcoming = list.filter((t) => time(t) >= now.getTime()).sort((a, b) => time(a) - time(b))
  const past = list.filter((t) => time(t) < now.getTime()).sort((a, b) => time(b) - time(a))
  return [...upcoming, ...past].slice(0, limit)
}

/** Materi terbaru lebih dulu. */
export function latestMaterials(materials, limit = 3) {
  return [...(materials ?? [])]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit)
}
