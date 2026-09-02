import { useEffect, useMemo, useState } from 'react'
import { authApi } from '../services/api'
import AuthContext from './auth-context'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('finalp4_token')))

  useEffect(() => {
    const token = localStorage.getItem('finalp4_token')
    if (!token) return

    authApi.me()
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch(() => {
        localStorage.removeItem('finalp4_token')
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = async (credentials) => {
    const result = await authApi.login(credentials)
    localStorage.setItem('finalp4_token', result.token)
    setUser(result.user)
    return result.user
  }

  const googleLogin = async (idToken) => {
    const result = await authApi.googleLogin(idToken)
    localStorage.setItem('finalp4_token', result.token)
    setUser(result.user)
    return result.user
  }

  const register = (payload) => authApi.register(payload)

  const logout = () => {
    localStorage.removeItem('finalp4_token')
    setUser(null)
  }

  const value = useMemo(() => ({ user, loading, login, googleLogin, register, logout }), [user, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
