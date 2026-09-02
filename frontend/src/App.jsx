import { useEffect, useState } from 'react'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import EmployeePage from './pages/EmployeePage'
import AdminPage from './pages/AdminPage'
import { useAuth } from './hooks/useAuth'

function App() {
  const [path, setPath] = useState(window.location.pathname || '/')
  const { user, loading, logout } = useAuth()

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname || '/')
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = (nextPath) => {
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">กำลังตรวจสอบการเข้าสู่ระบบ...</main>
  }

  if (path === '/register' && !user) return <RegisterPage onNavigate={navigate} />

  if (path === '/employee') {
    if (!user) return <LoginPage onNavigate={navigate} initialMessage="กรุณาเข้าสู่ระบบก่อนเข้าหน้าพนักงาน" />
    if (user.role === 'admin') return <AdminPage onNavigate={navigate} onLogout={logout} user={user} />
    return <EmployeePage onNavigate={navigate} onLogout={logout} user={user} />
  }

  if (path === '/admin') {
    if (!user) return <LoginPage onNavigate={navigate} initialMessage="กรุณาเข้าสู่ระบบก่อนเข้าหน้า Admin" />
    if (user.role !== 'admin') return <EmployeePage onNavigate={navigate} onLogout={logout} user={user} />
    return <AdminPage onNavigate={navigate} onLogout={logout} user={user} />
  }

  if (user) return user.role === 'admin'
    ? <AdminPage onNavigate={navigate} onLogout={logout} user={user} />
    : <EmployeePage onNavigate={navigate} onLogout={logout} user={user} />

  return <LoginPage onNavigate={navigate} />
}

export default App
