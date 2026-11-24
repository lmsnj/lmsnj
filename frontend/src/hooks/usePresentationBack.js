import { useLocation, useNavigate } from 'react-router-dom'
import { ROLE_HOME } from '../utils/constants'
import useAuth from './useAuth'

// Kembali dari layar presentasi; jika dibuka langsung (tab baru), ke Beranda peran.
export default function usePresentationBack() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  return () => (location.key === 'default' ? navigate(ROLE_HOME[user.role]) : navigate(-1))
}
