// id bagian daftar hasil di halaman admin (components/SplitExplorer.jsx).
export const RESULTS_ID = 'daftar-hasil'

/**
 * Gulir ke daftar hasil hanya jika belum terlihat: di HP (daftar ada di bawah penyaring) atau
 * jika halaman sudah digulir melewati awal daftar. Di layar lebar daftar sudah ada di samping.
 */
export function revealResults() {
  const element = document.getElementById(RESULTS_ID)
  if (!element) return
  const top = element.getBoundingClientRect().top
  // 64 px = tinggi header yang menempel di atas.
  if (top < 64 || top > window.innerHeight * 0.75) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}
