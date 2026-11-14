import { RESULTS_ID } from '../utils/results'

/**
 * Tata letak halaman admin (Pengguna, Ruang Kelas, Pengampu): panel penyaring di kiri dan daftar
 * hasil di kanan, agar hasil klik penyaring langsung terlihat di sampingnya. Panel kiri ikut
 * menempel saat daftar digulir. Di layar < lg keduanya bertumpuk (penyaring di atas).
 *
 * <SplitExplorer filters={<><OptionPanel .../></>}>...daftar hasil...</SplitExplorer>
 */
export default function SplitExplorer({ filters, children }) {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] lg:items-start">
      {/* p-1 -m-1: ruang untuk garis fokus & bayangan kartu agar tidak terpotong saat digulir. */}
      <aside className="-m-1 space-y-6 p-1 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
        {filters}
      </aside>
      <section id={RESULTS_ID} className="min-w-0 scroll-mt-20" aria-label="Daftar hasil">
        {children}
      </section>
    </div>
  )
}
