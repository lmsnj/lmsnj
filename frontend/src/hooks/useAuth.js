import { useContext } from 'react'
import { AuthContext } from '../context/auth-context'

export default function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth harus dipakai di dalam <AuthProvider>')
  return context
}
