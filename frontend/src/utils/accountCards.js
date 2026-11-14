// Kartu akun (nama, username, password) untuk dicetak atau dikirim lewat WhatsApp.
// Fungsi murni (tanpa window) kecuali `cardStore`, agar bisa diuji.

import { schoolAddress } from './tenant.js'

/**
 * Alamat login sekolah untuk ditulis di kartu: subdomain sekolah jika ada domain dasar
 * (smknj.sigmateknologi.my.id), selain itu alamat aplikasi yang sedang dibuka.
 */
export function loginAddress(code, baseDomain, location) {
  const url =
    schoolAddress(code, baseDomain, { protocol: location.protocol, port: location.port }) ??
    location.origin
  return url.replace(/^https?:\/\//, '')
}

/** Teks pesan untuk satu akun. Tanpa password (null) = pengguna memakai password lamanya. */
export function shareText({ schoolName, address, account }) {
  const lines = [
    `*Akun LMS ${schoolName}*`,
    '',
    `Nama: ${account.full_name}`,
    account.classroom && `Kelas: ${account.classroom}`,
    `Alamat: ${address}`,
    `Username: ${account.username}`,
    account.password
      ? `Password: ${account.password}`
      : 'Password: (password yang sudah Anda miliki)',
    '',
    account.password
      ? 'Segera ganti password setelah masuk (menu Profil > Ganti Password). Jangan bagikan akun ini kepada orang lain.'
      : 'Jangan bagikan akun ini kepada orang lain.',
  ]
  return lines.filter((line) => line !== null && line !== undefined && line !== false).join('\n')
}

/**
 * Tautan WhatsApp berisi pesan siap kirim. Tanpa nomor: WhatsApp meminta memilih kontak.
 * Nomor Indonesia "08..." diubah ke format internasional "628...".
 */
export function whatsappUrl(text, phone = '') {
  let number = String(phone).replace(/\D/g, '')
  if (number.startsWith('0')) number = `62${number.slice(1)}`
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}

// Kartu yang akan dicetak dititipkan ke halaman cetak lewat sessionStorage (hanya tab ini, hilang
// saat tab ditutup). Password tidak pernah dikirim balik ke server dan dihapus saat halaman cetak
// ditinggalkan.
const CARD_KEY = 'lms_account_cards'

export const cardStore = {
  save(data) {
    sessionStorage.setItem(CARD_KEY, JSON.stringify(data))
  },
  load() {
    try {
      return JSON.parse(sessionStorage.getItem(CARD_KEY))
    } catch {
      return null
    }
  },
  clear() {
    sessionStorage.removeItem(CARD_KEY)
  },
}
