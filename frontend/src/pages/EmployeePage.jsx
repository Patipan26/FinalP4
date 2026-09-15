import { useEffect, useMemo, useState } from 'react'
import BrandMark from '../components/BrandMark'
import StatusBadge from '../components/StatusBadge'
import SalarySlip from '../components/SalarySlip'
import { apiDownload, apiRequest } from '../services/api'
import { formatDate, formatLeaveDays, formatLeaveQuota, formatMoney, formatMonth, getDateInputValue } from '../utils/format'

const DEFAULT_QUOTAS = { 'ลาป่วย': 30, 'ลากิจ': 6, 'ลาพักร้อน': 6, 'ลาครึ่งวัน': 6 }
const SHOP_LOCATION = { latitude: 13.7563, longitude: 100.5018 }
const MAX_DISTANCE_METERS = 100
const WORK_START_TIME = import.meta.env.VITE_WORK_START_TIME || '09:00'
const WORK_END_TIME = import.meta.env.VITE_WORK_END_TIME || '18:00'
const ATTENDANCE_TEST_MODE = import.meta.env.VITE_ATTENDANCE_TEST_MODE !== 'false'
const TEST_MINUTE_WAGE = Number(import.meta.env.VITE_TEST_MINUTE_WAGE || 50)

function calculateDistance(latitude1, longitude1, latitude2, longitude2) {
  const earthRadius = 6371000
  const dLatitude = ((latitude2 - latitude1) * Math.PI) / 180
  const dLongitude = ((longitude2 - longitude1) * Math.PI) / 180
  const a = Math.sin(dLatitude / 2) ** 2
    + Math.cos((latitude1 * Math.PI) / 180) * Math.cos((latitude2 * Math.PI) / 180) * Math.sin(dLongitude / 2) ** 2
  return earthRadius * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function formatElapsedTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function formatHoursMinutes(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours === 0 && minutes === 0 && seconds > 0) return 'น้อยกว่า 1 นาที'
  return `${hours} ชม. ${minutes} นาที`
}

function formatAttendanceTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function TabButton({ active, label, icon, onClick }) {
  return <button type="button" onClick={onClick} className={`flex flex-1 flex-col items-center gap-1 text-[11px] ${active ? 'font-semibold text-blue-600' : 'text-slate-400'}`}><span className="text-lg">{icon}</span><span>{label}</span></button>
}

function formatAttendanceDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('th-TH-u-ca-buddhist', { day: '2-digit', month: 'short', year: 'numeric' })
}

function attendanceRuleClass(rule) {
  if (rule?.status === 'late' || rule?.status === 'early' || rule?.status === 'after-hours') return 'text-amber-600'
  return 'text-emerald-600'
}

function AttendanceHistory({ logs }) {
  return <section className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><div><h3 className="text-sm font-bold text-slate-700">ประวัติการลงเวลาเดือนนี้</h3><p className="text-[10px] text-slate-400">แสดงเวลาเข้า–ออกและตรวจสอบตามกฎ 09:00–18:00 น.</p></div>{logs.length === 0 ? <p className="rounded-xl bg-slate-50 p-5 text-center text-xs text-slate-400">ยังไม่มีประวัติการลงเวลา</p> : <div className="divide-y divide-slate-100">{logs.map((log) => <div key={log.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-xs font-semibold text-slate-700">{log.type === 'check-in' ? 'เข้างาน' : 'ออกงาน'} · {formatAttendanceDate(log.timestamp)}</p><p className="text-[10px] text-slate-400">เวลา {formatAttendanceTime(log.timestamp)} น.{log.type === 'check-out' && log.work_seconds ? ` · ทำงานช่วงนี้ ${formatHoursMinutes(log.work_seconds)}` : ''}</p></div><div className="text-right"><p className={`text-[10px] font-semibold ${attendanceRuleClass(log.attendance_rule)}`}>{log.attendance_rule?.label || 'ไม่พบกฎเวลา'}</p><p className="text-[10px] text-slate-400">{log.type === 'check-in' ? 'Check-in' : 'Check-out'}</p></div></div>)}</div>}</section>
}

export default function EmployeePage({ onNavigate, onLogout, user }) {
  const [activeTab, setActiveTab] = useState('attendance')
  const [now, setNow] = useState(new Date())
  const [gpsMessage, setGpsMessage] = useState(ATTENDANCE_TEST_MODE ? 'โหมดทดสอบ: ใช้พิกัดร้านสำหรับทดสอบ' : 'กำลังตรวจสอบตำแหน่งพิกัดของคุณ...')
  const [gpsAllowed, setGpsAllowed] = useState(ATTENDANCE_TEST_MODE)
  const [coordinates, setCoordinates] = useState(ATTENDANCE_TEST_MODE ? SHOP_LOCATION : null)
  const [attendance, setAttendance] = useState({ logs: [], summary: { total_hours: 0, total_work_days: 0 }, today: null })
  const [leaves, setLeaves] = useState([])
  const [quotas, setQuotas] = useState([])
  const [leaveYear, setLeaveYear] = useState(new Date().getFullYear())
  const [overtime, setOvertime] = useState({ rows: [], summary: { total_hours: 0, weighted_hours: 0 } })
  const [payrolls, setPayrolls] = useState([])
  const [currentPayroll, setCurrentPayroll] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [leaveForm, setLeaveForm] = useState({ leaveType: 'ลาป่วย', startDate: '', endDate: '', session: '', reason: '', attachment: null })

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    refreshData()
  }, [])

  async function refreshData() {
    setError('')
    try {
      const [attendanceData, leaveData, overtimeData, payrollData] = await Promise.all([apiRequest('/attendance/me'), apiRequest('/leaves/me'), apiRequest('/overtime/me'), apiRequest('/payrolls/me')])
      setAttendance(attendanceData)
      setLeaves(leaveData.rows || [])
      setQuotas(leaveData.quotas || [])
      setLeaveYear(Number(leaveData.year || new Date().getFullYear()))
      setOvertime(overtimeData)
      setPayrolls(payrollData.rows || [])
      setCurrentPayroll(payrollData.current || null)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const todayWorkFraction = Number(attendance.today?.work_fraction || 0)
  const todayWorkLabel = todayWorkFraction >= 1 ? 'เต็มวัน' : todayWorkFraction >= 0.5 ? 'ครึ่งวัน' : 'ยังไม่ครบครึ่งวัน'
  const todayStatus = attendance.today?.type === 'check-in' ? 'ลงเวลาเข้างานแล้ว' : attendance.today?.type === 'check-out' ? `ออกงานแล้ว (${todayWorkLabel})` : 'ยังไม่ได้ลงเวลา'
  const isCheckedIn = attendance.today?.type === 'check-in'
  const checkInTimestamp = isCheckedIn ? new Date(attendance.today.timestamp).getTime() : 0
  const activeTimerSeconds = checkInTimestamp ? Math.max(0, Math.floor((now.getTime() - checkInTimestamp) / 1000)) : 0
  const completedTimerSeconds = Number(attendance.today?.work_seconds || 0)
  const todayTimerSeconds = isCheckedIn ? activeTimerSeconds : attendance.today?.type === 'check-out' ? completedTimerSeconds : 0
  const totalHours = Number(attendance.summary?.total_hours || 0)
  const totalWorkSeconds = Number(attendance.summary?.total_seconds || Math.round(totalHours * 3600))
  const displayedTotalSeconds = totalWorkSeconds + (isCheckedIn ? activeTimerSeconds : 0)
  const hourlyWage = Number(attendance.summary?.hourly_wage || 50)
  const testMinuteWage = Number(attendance.summary?.test_minute_wage || TEST_MINUTE_WAGE)
  const testMode = attendance.summary?.test_mode ?? ATTENDANCE_TEST_MODE
  const estimatedWage = Number(attendance.summary?.estimated_wage || totalHours * hourlyWage)
  const totalOvertimeHours = Number(overtime.summary?.total_hours || 0)
  const totalOvertimePay = overtime.rows.reduce((sum, item) => sum + Number(item.estimated_pay || 0), 0)
  const todayInputValue = getDateInputValue(now)

  const quotaMap = useMemo(() => quotas.reduce((result, item) => {
    result[item.leave_type] = item
    return result
  }, {}), [quotas])

  const getQuota = (type) => quotaMap[type] || { quota_days: DEFAULT_QUOTAS[type], used_days: 0, remaining_days: DEFAULT_QUOTAS[type] }

  const checkLocation = () => {
    setMessage('')
    setError('')
    if (ATTENDANCE_TEST_MODE) {
      setCoordinates(SHOP_LOCATION)
      setGpsAllowed(true)
      setGpsMessage('โหมดทดสอบ: ใช้พิกัดร้านสำหรับทดสอบ')
      return
    }
    if (!navigator.geolocation) {
      setGpsMessage('อุปกรณ์ของคุณไม่รองรับการระบุตำแหน่ง GPS')
      setGpsAllowed(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const distance = calculateDistance(coords.latitude, coords.longitude, SHOP_LOCATION.latitude, SHOP_LOCATION.longitude)
        setCoordinates({ latitude: coords.latitude, longitude: coords.longitude })
        if (distance <= MAX_DISTANCE_METERS) {
          setGpsAllowed(true)
          setGpsMessage(`อยู่ในระยะที่ทำงานเรียบร้อย (${Math.round(distance)} เมตร)`)
        } else {
          setGpsAllowed(false)
          setGpsMessage(`กรุณาเข้าใกล้รัศมีที่ทำงาน (ปัจจุบันห่าง ${Math.round(distance)} เมตร)`)
        }
      },
      () => {
        setGpsAllowed(false)
        setGpsMessage('ไม่สามารถเข้าถึงตำแหน่ง GPS ของคุณได้ กรุณาเปิด GPS')
      },
      { enableHighAccuracy: true },
    )
  }

  const submitAttendance = async (type) => {
    if (!coordinates) return checkLocation()
    setSubmitting(true)
    setMessage('')
    setError('')
    try {
      const result = await apiRequest(`/attendance/${type}`, { method: 'POST', body: JSON.stringify(coordinates) })
      setMessage(result.message)
      await refreshData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const openLeaveModal = () => {
    setLeaveForm({ leaveType: 'ลาป่วย', startDate: '', endDate: '', session: '', reason: '', attachment: null })
    setMessage('')
    setError('')
    setModalOpen(true)
  }

  const changeLeaveType = (leaveType) => setLeaveForm((current) => ({ ...current, leaveType, session: '' }))

  const submitLeave = async (event) => {
    event.preventDefault()
    if (!leaveForm.startDate || leaveForm.startDate < todayInputValue) {
      setError('ไม่สามารถยื่นใบลาย้อนหลังได้ กรุณาเลือกวันนี้หรือวันถัดไป')
      return
    }
    if (!leaveForm.endDate || leaveForm.endDate < leaveForm.startDate) {
      setError('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มลา')
      return
    }
    setSubmitting(true)
    setMessage('')
    setError('')
    try {
      const formData = new FormData()
      formData.append('leaveType', leaveForm.leaveType)
      formData.append('startDate', leaveForm.startDate)
      formData.append('endDate', leaveForm.endDate)
      formData.append('session', leaveForm.session || '')
      formData.append('reason', leaveForm.reason)
      if (leaveForm.attachment) formData.append('attachment', leaveForm.attachment)
      const result = await apiRequest('/leaves', { method: 'POST', body: formData })
      setMessage(result.message)
      setModalOpen(false)
      await refreshData()
      setActiveTab('leave')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const downloadAttachment = async (id, fileName) => {
    try {
      const blob = await apiDownload(`/leaves/${id}/attachment`)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName || 'เอกสารประกอบการลา'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const cancelLeave = async (id) => {
    if (!window.confirm('ต้องการยกเลิกคำขอลานี้หรือไม่?')) return
    try {
      const result = await apiRequest(`/leaves/${id}`, { method: 'DELETE' })
      setMessage(result.message)
      await refreshData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const logout = () => (onLogout ? onLogout() : onNavigate('/'))
  const statusClass = gpsAllowed ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : 'border-rose-100 bg-rose-50 text-rose-600'

  return (
    <main className="min-h-screen bg-slate-100 pb-24">
      <header className="border-b border-slate-100 bg-white px-4 py-4 md:px-8"><div className="mx-auto flex max-w-6xl items-center justify-between"><BrandMark /><div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-bold text-slate-800">{user?.full_name || 'พนักงาน'}</p><p className="text-[11px] text-slate-400">{user?.email || '-'}</p></div><button type="button" onClick={logout} className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-100">ออกจากระบบ</button></div></div></header>

      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
        {error && <p className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
        {message && <p className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">{message}</p>}

        {activeTab === 'attendance' && <section className="space-y-4"><div className="rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-sm"><p className="text-sm text-slate-500">{now.toLocaleDateString('th-TH-u-ca-buddhist', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p><h2 className="my-2 text-5xl font-bold tracking-tight text-blue-600">{now.toLocaleTimeString('th-TH', { hour12: false })}</h2><span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />สถานะ: {todayStatus}</span></div><div className="grid grid-cols-2 gap-3"><button type="button" disabled={!gpsAllowed || isCheckedIn || submitting} onClick={() => submitAttendance('check-in')} className="rounded-2xl bg-blue-600 p-5 text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><span className="block text-2xl">↪</span><span className="mt-1 block text-sm font-semibold">ลงเวลาเข้างาน</span><span className="text-[10px] opacity-80">09:00 น.</span></button><button type="button" disabled={!gpsAllowed || !isCheckedIn || submitting} onClick={() => submitAttendance('check-out')} className="rounded-2xl bg-slate-700 p-5 text-white shadow-md transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><span className="block text-2xl">↩</span><span className="mt-1 block text-sm font-semibold">ลงเวลาออกงาน</span><span className="text-[10px] opacity-80">18:00 น.</span></button></div><div className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 text-xs ${statusClass}`}><span>📍 {gpsMessage}</span><button type="button" onClick={checkLocation} className="shrink-0 rounded-lg bg-white/70 px-2 py-1 text-[11px] font-semibold hover:bg-white">ตรวจใหม่</button></div><div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-blue-800">จับเวลาการทำงาน</p><p className="mt-1 text-[10px] text-blue-500">เวลางานมาตรฐาน {WORK_START_TIME}–{WORK_END_TIME} น.</p>{attendance.today?.attendance_rule && <p className={`mt-1 text-[10px] font-semibold ${attendance.today.attendance_rule.status === 'on-time' ? 'text-emerald-600' : 'text-amber-600'}`}>{attendance.today.attendance_rule.label}</p>}</div><strong className="font-mono text-2xl tracking-tight text-blue-700">{formatElapsedTime(todayTimerSeconds)}</strong></div><p className="mt-2 text-[10px] text-blue-500">{isCheckedIn ? `เริ่มจับเวลาตั้งแต่ ${formatAttendanceTime(attendance.today.timestamp)} น.` : attendance.today?.type === 'check-out' ? `วันนี้ทำงานแล้ว ${formatElapsedTime(completedTimerSeconds)}` : 'กดลงเวลาเข้างานเพื่อเริ่มจับเวลา'}</p>{testMode && <p className="mt-1 text-[10px] font-semibold text-amber-600">โหมดทดสอบ: 1 นาที = ฿{testMinuteWage.toFixed(2)}</p>}</div><div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><div><p className="text-sm font-semibold text-slate-800">ชั่วโมงสะสมเดือนนี้</p><p className="text-xs text-slate-400">รวมเวลาที่ทำงานจริง</p></div><strong className="text-right text-lg text-blue-600">{formatHoursMinutes(displayedTotalSeconds)} <span className="block text-xs font-normal text-slate-400">/ 176 ชม.</span></strong></div><AttendanceHistory logs={attendance.logs} /></section>}

        {activeTab === 'leave' && <section className="space-y-4"><h2 className="text-base font-bold text-slate-700">โควตาวันลาคงเหลือ (รายปี) พ.ศ. {leaveYear + 543}</h2><div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><div className="mb-2 flex items-center justify-between"><div><p className="text-xs text-slate-400">ลาป่วย</p><p className="text-xl font-bold text-blue-600">{formatLeaveQuota(getQuota('ลาป่วย').remaining_days, getQuota('ลาป่วย').quota_days)}</p></div><span className="text-2xl">🩹</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.min(100, (Number(getQuota('ลาป่วย').remaining_days) / Number(getQuota('ลาป่วย').quota_days || 1)) * 100)}%` }} /></div></div><div className="grid grid-cols-2 gap-3">{['ลาพักร้อน', 'ลากิจ'].map((type) => <div key={type} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-xs text-slate-400">{type}</p><p className="text-lg font-bold text-slate-800">{formatLeaveDays(getQuota(type).remaining_days)}</p><p className="text-[10px] text-slate-400">จากทั้งหมด {formatLeaveDays(getQuota(type).quota_days)}</p></div>)}</div><button type="button" onClick={openLeaveModal} className="w-full rounded-2xl bg-blue-600 p-3.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">＋ สร้างคำขอลาใหม่</button><div className="space-y-2 pt-2"><h3 className="text-sm font-bold text-slate-700">รายการคำขอลาที่ผ่านมา</h3>{leaves.length === 0 ? <p className="py-4 text-center text-xs text-slate-400">ยังไม่มีรายการใบลา</p> : leaves.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm"><div><p className="text-xs font-bold text-slate-800">{item.leave_type} ({formatLeaveDays(item.days)})</p><p className="text-[10px] text-slate-400">{formatDate(item.start_date)} ถึง {formatDate(item.end_date)}{item.leave_session ? ` (${item.leave_session === 'morning' ? 'ช่วงเช้า' : 'ช่วงบ่าย'})` : ''}</p><p className="text-[10px] text-slate-500">{item.reason}</p>{item.attachment_original_name && <button type="button" onClick={() => downloadAttachment(item.id, item.attachment_original_name)} className="mt-1 text-[10px] font-semibold text-blue-600 hover:underline">📎 {item.attachment_original_name}</button>}</div><div className="flex shrink-0 flex-col items-end gap-1"><StatusBadge status={item.status} />{item.status === 'pending' && <button type="button" onClick={() => cancelLeave(item.id)} className="text-[10px] text-rose-600 hover:underline">ยกเลิก</button>}</div></div>)}</div></section>}

        {activeTab === 'history' && <SalarySection compact currentPayroll={currentPayroll} payrolls={payrolls} overtime={overtime} hourlyWage={hourlyWage} estimatedWage={estimatedWage} totalOvertimeHours={totalOvertimeHours} totalOvertimePay={totalOvertimePay} testMinuteWage={testMinuteWage} user={user} />}
        {activeTab === 'settings' && <section className="rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-sm"><div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-2xl">👤</div><h2 className="font-bold text-slate-800">{user?.email || '-'}</h2><p className="mb-5 text-xs text-slate-400">{user?.position || 'พนักงานประจำ'}</p><button type="button" onClick={logout} className="w-full rounded-2xl bg-rose-50 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-100">ออกจากระบบ</button></section>}
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:mx-auto md:max-w-3xl md:rounded-t-2xl"><div className="mx-auto flex max-w-md justify-around"><TabButton active={activeTab === 'attendance'} label="ลงเวลา" icon="⏱" onClick={() => setActiveTab('attendance')} /><TabButton active={activeTab === 'leave'} label="ใบลา" icon="📅" onClick={() => setActiveTab('leave')} /><TabButton active={activeTab === 'history'} label="เงินเดือน" icon="฿" onClick={() => setActiveTab('history')} /><TabButton active={activeTab === 'settings'} label="ตั้งค่า" icon="⚙" onClick={() => setActiveTab('settings')} /></div></nav>

      {modalOpen && <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4"><form onSubmit={submitLeave} className="w-full max-w-md space-y-3 rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><h2 className="font-bold text-slate-800">ยื่นคำขอลาหยุด</h2><button type="button" onClick={() => setModalOpen(false)} className="text-xl text-slate-400">×</button></div><p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">ระบบไม่อนุญาตให้ยื่นใบลาย้อนหลัง เลือกได้ตั้งแต่วันนี้เป็นต้นไป</p><label className="block text-xs font-semibold">ประเภทการลา<select value={leaveForm.leaveType} onChange={(event) => changeLeaveType(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs"><option>ลาป่วย</option><option>ลากิจ</option><option>ลาพักร้อน</option></select></label><div className="grid grid-cols-2 gap-2"><label className="block text-xs font-semibold">เริ่มวันที่<input required min={todayInputValue} value={leaveForm.startDate} onChange={(event) => setLeaveForm((current) => ({ ...current, startDate: event.target.value }))} type="date" className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs" />{leaveForm.startDate && <span className="mt-1 block text-[10px] font-normal text-slate-400">วันที่ไทย: {formatDate(leaveForm.startDate)}</span>}</label><label className="block text-xs font-semibold">ถึงวันที่<input required min={leaveForm.startDate || todayInputValue} value={leaveForm.endDate} onChange={(event) => setLeaveForm((current) => ({ ...current, endDate: event.target.value }))} type="date" className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs" />{leaveForm.endDate && <span className="mt-1 block text-[10px] font-normal text-slate-400">วันที่ไทย: {formatDate(leaveForm.endDate)}</span>}</label></div><label className="block text-xs font-semibold">เหตุผล<textarea required value={leaveForm.reason} onChange={(event) => setLeaveForm((current) => ({ ...current, reason: event.target.value }))} rows="3" placeholder="ระบุเหตุผลการลา..." className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs" /></label><label className="block text-xs font-semibold">เอกสารประกอบการลา <span className="font-normal text-slate-400">(ถ้ามี)</span><input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => setLeaveForm((current) => ({ ...current, attachment: event.target.files?.[0] || null }))} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs" /><span className="mt-1 block text-[10px] font-normal text-slate-400">รองรับ PDF, JPG, PNG ขนาดไม่เกิน 5 MB</span>{leaveForm.attachment && <span className="mt-1 block truncate text-[10px] text-blue-600">ไฟล์ที่เลือก: {leaveForm.attachment.name}</span>}</label><div className="flex gap-2 pt-2"><button type="button" onClick={() => setModalOpen(false)} className="w-1/2 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-600">ยกเลิก</button><button disabled={submitting} type="submit" className="w-1/2 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white disabled:opacity-60">{submitting ? 'กำลังส่ง...' : 'ส่งคำขอ'}</button></div></form></div>}
    </main>
  )
}

function SalarySection({ compact, currentPayroll, payrolls, overtime, hourlyWage, estimatedWage, totalOvertimeHours, totalOvertimePay, testMinuteWage, user }) {
  if (compact) return <SalarySlip currentPayroll={currentPayroll} payrolls={payrolls} overtime={overtime} hourlyWage={hourlyWage} testMinuteWage={testMinuteWage} user={user} />

  return <section className="space-y-4"><div><p className="text-xs text-slate-400">รายได้ประจำเดือน</p><h2 className="text-lg font-bold text-slate-800">สลิปเงินเดือนของฉัน</h2><p className="text-xs text-slate-500">เงินเดือนจะปรากฏเมื่อผู้ดูแลคำนวณและบันทึกงวดเงินเดือนแล้ว</p></div>{currentPayroll ? <div className="salary-slip space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between border-b border-dashed border-slate-200 pb-4"><div><p className="text-xs text-slate-400">รอบเงินเดือน</p><h3 className="text-xl font-bold text-slate-800">{formatMonth(currentPayroll.payroll_month)}</h3><p className="mt-1 text-xs text-slate-500">{user?.full_name} · {user?.employee_code || '-'}</p></div><div className="text-right"><StatusBadge status={currentPayroll.payment_status} /><p className="mt-2 text-2xl font-bold text-blue-600">฿{formatMoney(currentPayroll.net_salary)}</p></div></div><div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4"><SlipMetric label="ค่าแรงปกติ" value={`฿${formatMoney(currentPayroll.regular_pay)}`} /><SlipMetric label="OT" value={`฿${formatMoney(currentPayroll.overtime_pay)}`} /><SlipMetric label="ชั่วโมงทำงาน" value={`${Number(currentPayroll.regular_hours || 0).toFixed(2)} ชม.`} /><SlipMetric label="ชั่วโมง OT" value={`${Number(currentPayroll.overtime_hours || 0).toFixed(2)} ชม.`} /></div><div className="flex items-center justify-between border-t border-slate-100 pt-4"><div><p className="text-xs text-slate-400">รายได้รวม</p><p className="font-bold text-slate-800">฿{formatMoney(currentPayroll.gross_salary)}</p></div><button type="button" onClick={() => window.print()} className="no-print rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-700">พิมพ์สลิป</button></div></div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">ยังไม่มีสลิปเงินเดือนของเดือนนี้</div>}<div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-xs text-slate-400">ค่าแรงพื้นฐาน</p><p className="mt-1 text-xl font-bold text-slate-800">{formatMoney(hourlyWage)} บาท/ชม.</p></div><div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-xs text-slate-400">OT เดือนนี้</p><p className="mt-1 text-xl font-bold text-amber-600">{totalOvertimeHours.toFixed(2)} ชม.</p></div><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm"><p className="text-xs text-emerald-600">รายได้ประมาณการ</p><p className="mt-1 text-xl font-bold text-emerald-700">{formatMoney(estimatedWage + totalOvertimePay)} บาท</p></div></div><section className="space-y-3"><h3 className="text-sm font-bold text-slate-700">รายการ OT เดือนนี้</h3>{overtime.rows.length === 0 ? <p className="rounded-2xl bg-white p-5 text-center text-xs text-slate-400">ยังไม่มีรายการ OT</p> : <div className="space-y-2">{overtime.rows.map((item) => <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm"><div><p className="text-xs font-bold text-slate-800">{item.work_date} · {Number(item.hours).toFixed(2)} ชั่วโมง</p><p className="text-[10px] text-slate-400">อัตรา {Number(item.rate_multiplier).toFixed(2)} เท่า {item.note ? `· ${item.note}` : ''}</p></div><strong className="text-sm text-amber-600">฿{formatMoney(item.estimated_pay)}</strong></div>)}</div>}</section><section className="space-y-3"><h3 className="text-sm font-bold text-slate-700">ประวัติสลิปเงินเดือน</h3>{payrolls.length === 0 ? <p className="rounded-2xl bg-white p-5 text-center text-xs text-slate-400">ยังไม่มีประวัติเงินเดือน</p> : <div className="space-y-2">{payrolls.map((item) => <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm"><div><p className="text-xs font-bold text-slate-800">{formatMonth(item.payroll_month)}</p><p className="text-[10px] text-slate-400">ทำงาน {Number(item.regular_hours || 0).toFixed(2)} ชม. · OT {Number(item.overtime_hours || 0).toFixed(2)} ชม.</p></div><div className="text-right"><StatusBadge status={item.payment_status} /><p className="mt-1 text-sm font-bold text-slate-800">฿{formatMoney(item.net_salary)}</p></div></div>)}</div>}</section></section>
}

function SlipMetric({ label, value }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400">{label}</p><p className="mt-1 font-semibold text-slate-700">{value}</p></div>
}
