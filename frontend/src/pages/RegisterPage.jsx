import { useState } from 'react'
import BrandMark from '../components/BrandMark'
import { useAuth } from '../hooks/useAuth'

export default function RegisterPage({ onNavigate }) {
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { register } = useAuth()

  const handleSubmit = async (event) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    if (formData.get('password') !== formData.get('confirmPassword')) {
      setIsError(true)
      setMessage('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน')
      return
    }
    setSubmitting(true)
    setMessage('')
    try {
      await register({ fullName: formData.get('fullName'), email: formData.get('email'), password: formData.get('password') })
      setIsError(false)
      setMessage('สมัครสมาชิกสำเร็จ กำลังกลับไปหน้า Login...')
      window.setTimeout(() => onNavigate('/'), 900)
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
          <div className="mb-4 flex justify-center"><BrandMark compact /></div>
          <h1 className="text-base font-bold text-slate-700">สร้างบัญชีผู้ใช้งาน</h1>
          <p className="mt-2 text-xs text-slate-400">บัญชีใหม่จะมีสิทธิ์เป็นพนักงานโดยค่าเริ่มต้น</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-xs font-semibold text-slate-700">ชื่อ-นามสกุล<input name="fullName" required type="text" placeholder="กรอกชื่อจริงของคุณ" className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-normal outline-none focus:ring-2 focus:ring-blue-500" /></label>
          <label className="block text-xs font-semibold text-slate-700">อีเมล<input name="email" required type="email" placeholder="example@work.com" className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-normal outline-none focus:ring-2 focus:ring-blue-500" /></label>
          <label className="block text-xs font-semibold text-slate-700">รหัสผ่าน<input name="password" required minLength="6" type="password" placeholder="อย่างน้อย 6 ตัวอักษร" className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-normal outline-none focus:ring-2 focus:ring-blue-500" /></label>
          <label className="block text-xs font-semibold text-slate-700">ยืนยันรหัสผ่าน<input name="confirmPassword" required type="password" placeholder="กรอกรหัสผ่านอีกครั้ง" className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-normal outline-none focus:ring-2 focus:ring-blue-500" /></label>

          {message && <p className={`rounded-xl border p-3 text-xs ${isError ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-blue-100 bg-blue-50 text-blue-700'}`}>{message}</p>}
          <button disabled={submitting} type="submit" className="w-full rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">{submitting ? 'กำลังสมัครสมาชิก...' : 'สมัครสมาชิก'}</button>
        </form>

        <p className="text-center text-xs text-slate-600">
          มีบัญชีผู้ใช้งานอยู่แล้ว?{' '}
          <button type="button" onClick={() => onNavigate('/')} className="font-semibold text-blue-600 hover:underline">เข้าสู่ระบบ</button>
        </p>
      </section>
    </main>
  )
}
