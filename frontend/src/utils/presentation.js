// Fungsi murni mode presentasi kelas (Mapel Umum Tahap 4). Tampilan ada di components/presentation/.

// Pengaturan presentasi.ukuran_huruf -> perbesaran layar (CSS zoom) untuk TV kelas.
export const ZOOM_LEVELS = [0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2]
const SIZE_ZOOM = { normal: 1, besar: 1.3, sangat_besar: 1.5 }

export function zoomIndexFor(size) {
  const index = ZOOM_LEVELS.indexOf(SIZE_ZOOM[size] ?? SIZE_ZOOM.besar)
  return index === -1 ? ZOOM_LEVELS.indexOf(1) : index
}

export function stepZoom(index, delta) {
  return Math.min(ZOOM_LEVELS.length - 1, Math.max(0, index + delta))
}

/**
 * Urutan slide satu materi: pembuka (judul + capaian), satu slide per konten (utama lalu konten
 * tambahan sesuai urutan), penutup. Materi Media Interaktif tidak memakai slide (halamannya sendiri).
 */
export function buildSlides(material) {
  const contents = [
    {
      kind: 'content',
      id: 'main',
      title: material.title,
      type: material.material_type,
      item: null,
    },
    ...(material.items ?? []).map((item) => ({
      kind: 'content',
      id: `item-${item.id}`,
      title: item.title,
      type: item.material_type,
      item,
    })),
  ]
  return [{ kind: 'title', id: 'title' }, ...contents, { kind: 'end', id: 'end' }]
}

// Tombol keyboard & remote presenter. Remote umumnya mengirim PageDown/PageUp, sebagian
// juga "B" / "." (layar hitam) dan F5 / Escape. `typing` = fokus sedang di kotak isian.
const KEY_ACTIONS = {
  ArrowRight: 'next',
  ArrowDown: 'next',
  PageDown: 'next',
  ' ': 'next',
  Enter: 'next',
  ArrowLeft: 'prev',
  ArrowUp: 'prev',
  PageUp: 'prev',
  Backspace: 'prev',
  Home: 'first',
  End: 'last',
  b: 'black',
  B: 'black',
  '.': 'black',
  w: 'black',
  W: 'black',
}

// Tombol yang tetap dipakai halaman (mis. Spasi/Enter pada tombol, panah di soal) di luar slide.
const PAGE_KEYS = new Set(['PageDown', 'PageUp', 'b', 'B', '.'])

/**
 * Aksi untuk satu tombol. `target`: 'body' (fokus bebas), 'control' (tombol/tautan; Spasi & Enter
 * menekan tombol itu), 'typing' (kotak isian; hanya tombol remote), 'frame' (di dalam Media
 * Interaktif: panah & Spasi dipakai soal, jadi hanya tombol remote).
 */
export function keyAction(key, target = 'body', modifiers = false) {
  if (modifiers) return null
  const action = KEY_ACTIONS[key] ?? null
  if (!action) return null
  if (target === 'typing' || target === 'frame') return PAGE_KEYS.has(key) ? action : null
  if (target === 'control' && (key === ' ' || key === 'Enter')) return null
  return action
}

export function moveSlide(index, action, count) {
  if (action === 'next') return Math.min(count - 1, index + 1)
  if (action === 'prev') return Math.max(0, index - 1)
  if (action === 'first') return 0
  if (action === 'last') return count - 1
  return index
}

// --- Timer hitung mundur ---
// Keadaan: { total, left, runningSince } (detik; runningSince = Date.now() saat jalan, null = berhenti).

export function newTimer(minutes) {
  const total = Math.max(1, Math.round(Number(minutes) || 5)) * 60
  return { total, left: total, runningSince: null }
}

export function timerLeft(timer, now) {
  if (timer.runningSince === null) return timer.left
  return Math.max(0, timer.left - Math.floor((now - timer.runningSince) / 1000))
}

export function toggleTimer(timer, now) {
  if (timer.runningSince !== null)
    return { ...timer, left: timerLeft(timer, now), runningSince: null }
  // Timer yang sudah habis dimulai ulang dari awal.
  const left = timer.left > 0 ? timer.left : timer.total
  return { ...timer, left, runningSince: now }
}

export function addMinute(timer, now, minutes = 1) {
  const left = timerLeft(timer, now) + minutes * 60
  if (left <= 0) return { ...timer, left: 0, runningSince: null }
  return {
    total: Math.max(timer.total, left),
    left,
    runningSince: timer.runningSince === null ? null : now,
  }
}

export function resetTimer(timer) {
  return { ...timer, left: timer.total, runningSince: null }
}

export function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  return `${String(minutes).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

// Alamat layar presentasi satu materi (Media Interaktif punya pemutarnya sendiri).
export function presentationPath(material) {
  const kind = material.material_type === 'media' ? 'media' : 'materi'
  return `/presentasi/${kind}/${material.id}`
}
