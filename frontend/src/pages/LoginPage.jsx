import { useCallback, useEffect, useRef, useState } from 'react'
import BrandMark from '../components/BrandMark'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage({ onNavigate, initialMessage = '' }) {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const googleButtonRef = useRef(null)
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState(initialMessage)
  const [isError, setIsError] = useState(Boolean(initialMessage))
  const [submitting, setSubmitting] = useState(false)
  const { login, googleLogin } = useAuth()

  const handleGoogleCredential = useCallback(async ({ credential }) => {
    if (!credential) return
    setMessage('')
    setIsError(false)
    setSubmitting(true)
    try {
      const user = await googleLogin(credential)
      onNavigate(user.role === 'admin' ? '/admin' : '/employee')
    } catch (error) {
      setIsError(true)
      setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }, [googleLogin, onNavigate])

  useEffect(() => {
    if (!googleClientId) return undefined
    let script = document.querySelector('script[data-google-identity]')
    let cancelled = false
    const renderGoogleButton = () => {
      if (cancelled || !window.google || !googleButtonRef.current) return
      window.google.accounts.id.initialize({ client_id: googleClientId, callback: handleGoogleCredential })
      googleButtonRef.current.innerHTML = ''
      window.google.accounts.id.renderButton(googleButtonRef.current, { theme: 'outline', size: 'large', width: 380, text: 'signin_with', shape: 'rectangular', logo_alignment: 'left', locale: 'th' })
    }

    if (!script) {
      script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.dataset.googleIdentity = 'true'
      document.head.appendChild(script)
    }
    if (window.google) renderGoogleButton()
    else script.addEventListener('load', renderGoogleButton)
    return () => { cancelled = true; script?.removeEventListener('load', renderGoogleButton) }
  }, [googleClientId, handleGoogleCredential])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage('')
    setIsError(false)
    setSubmitting(true)
    try {
      const user = await login({ email, password })
      onNavigate(user.role === 'admin' ? '/admin' : '/employee')
    } catch (error) {
      setIsError(true)
      setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-md space-y-6 rounded-3xl border border-slate-100 bg-white p-8 shadow-sm">
        <div className="text-center">
          <div className="mx-auto mb-4 flex w-fit justify-center"><BrandMark compact /></div>
          <h1 className="text-xl font-bold text-slate-800">ระบบจัดการร้านล้างรถ</h1>
          <p className="mt-2 text-xs text-slate-400">เข้าสู่ระบบพนักงานและผู้ดูแลระบบ</p>
        </div>

        {googleClientId ? <div ref={googleButtonRef} className="google-signin-container flex min-h-11 justify-center overflow-hidden rounded-2xl" /> : <button
          type="button"
          onClick={() => { setIsError(true); setMessage('กรุณาตั้งค่า GOOGLE_CLIENT_ID ก่อนใช้งาน Google Login') }}
          className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <span className="text-base font-bold text-blue-600">G</span>
          เข้าสู่ระบบด้วย Google
        </button>}

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-200" />
          หรือใช้อีเมล
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-xs font-semibold text-slate-700">
            อีเมล
            <input required value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="example@work.com" className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-normal text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500" />
          </label>

          <label className="block text-xs font-semibold text-slate-700">
            รหัสผ่าน
            <div className="relative mt-1">
              <input required value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} placeholder="กรอกรหัสผ่านของคุณ" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-16 text-xs font-normal text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 px-2 text-[11px] text-slate-400 hover:text-slate-700">
                {showPassword ? 'ซ่อน' : 'แสดง'}
              </button>
            </div>
          </label>

          {message && <p className={`rounded-xl border p-3 text-xs ${isError ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-blue-100 bg-blue-50 text-blue-700'}`}>{message}</p>}

          <button disabled={submitting} type="submit" className="w-full rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">{submitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ →'}</button>
        </form>

        <p className="border-t border-slate-100 pt-4 text-center text-xs text-slate-600">
          ยังไม่มีบัญชีผู้ใช้งาน?{' '}
          <button type="button" onClick={() => onNavigate('/register')} className="font-semibold text-blue-600 hover:underline">สมัครสมาชิก</button>
        </p>
      </section>
    </main>
  )
}
