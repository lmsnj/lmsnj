import { useLocation, useNavigate } from 'react-router-dom'
import { BASE_DOMAIN } from '../api/client'
import { cardStore, loginAddress, shareText } from '../utils/accountCards'
import useAuth from './useAuth'

/**
 * Alat bantu kartu akun untuk sekolah yang sedang dibuka:
 * - `address`: alamat login sekolah (mis. smknj.sigmateknologi.my.id)
 * - `textFor(account)`: teks pesan WhatsApp satu akun
 * - `printCards(accounts)`: buka halaman cetak kartu (A4, 10 kartu per lembar)
 */
export default function useAccountCards() {
  const { school } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const schoolName = school?.name ?? ''
  const address = loginAddress(school?.code, BASE_DOMAIN, window.location)

  const textFor = (account) => shareText({ schoolName, address, account })
  const printCards = (accounts) => {
    cardStore.save({ schoolName, address, accounts, back: location.pathname })
    navigate('/cetak/kartu-akun')
  }
  return { address, schoolName, textFor, printCards }
}
