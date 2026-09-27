import { Component } from 'react'

/**
 * Menangkap error saat render agar pengguna melihat pesan, bukan layar putih.
 * Dipasang di sekitar isi halaman (dengan `key` = alamat halaman, sehingga error
 * di satu halaman tidak terbawa saat pindah halaman) dan di sekitar seluruh aplikasi.
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Tetap tampil di konsol browser untuk keperluan perbaikan.
    console.error('Terjadi error di tampilan:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-lg font-semibold text-slate-900">Maaf, halaman ini mengalami masalah</p>
        <p className="mt-2 text-sm text-slate-600">
          Coba muat ulang halaman. Jika masih terjadi, laporkan ke admin sekolah beserta langkah
          yang Anda lakukan sebelumnya.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Muat Ulang
        </button>
      </div>
    )
  }
}
