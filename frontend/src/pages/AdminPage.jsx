import { useEffect, useMemo, useState } from 'react'
import BrandMark from '../components/BrandMark'
import StatusBadge from '../components/StatusBadge'
import { apiDownload, apiRequest } from '../services/api'
import { formatDate, formatLeaveDays, formatMoney, formatMonth, getDateInputValue } from '../utils/format'

const today = getDateInputValue()
const currentMonth = today.slice(0, 7)
const menu = [['dashboard', '▦', 'หน้าหลัก'], ['employees', '♟', 'พนักงาน'], ['attendance', '▣', 'ตารางงาน'], ['overtime', '＋', 'บันทึก OT'], ['payroll', '฿', 'เงินเดือน']]
const wageTypeLabels = { hourly: 'รายชั่วโมง', daily: 'รายวัน', monthly: 'รายเดือน' }

function toDateTimeLocal(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatAttendanceDuration(seconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return `${hours} ชม. ${minutes} นาที`
}

function formatBuddhistDateInput(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  return `${match[3]}/${match[2]}/${Number(match[1]) + 543}`
}

function parseBuddhistDateInput(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return ''
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3]) >= 2400 ? Number(match[3]) - 543 : Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatBuddhistDateTimeInput(value) {
  const localValue = toDateTimeLocal(value)
  const match = localValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/)
  return match ? `${match[3]}/${match[2]}/${Number(match[1]) + 543} ${match[4]}` : ''
}

function parseBuddhistDateTimeInput(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/)
  if (!match) return ''
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3]) >= 2400 ? Number(match[3]) - 543 : Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function getMonthEndDate(month) {
  const [year, monthNumber] = String(month || currentMonth).slice(0, 7).split('-').map(Number)
  const lastDay = new Date(year, monthNumber, 0).getDate()
  return `${year}-${String(monthNumber).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

function getMonthKey(value) {
  const match = String(value || '').match(/(\d{4})-(\d{2})/)
  return match ? `${match[1]}-${match[2]}` : ''
}

function escapeReportHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function reportStatusLabel(status) {
  return { draft: 'ฉบับร่าง', approved: 'อนุมัติแล้ว', paid: 'จ่ายแล้ว', pending: 'รออนุมัติ', rejected: 'ปฏิเสธ', cancelled: 'ยกเลิกแล้ว' }[status] || status || '-'
}

function reportMoney(value) {
  return `${formatMoney(value)} บาท`
}

function buildReportHtml({ reportMonth, employees = [], leaves = [], attendanceRows = [], overtimeRows = [], payrollRows = [] }) {
  const activeEmployees = employees.filter((item) => item.role === 'employee' && item.status === 'active')
  const approvedOvertimeRows = overtimeRows.filter((item) => item.status === 'approved')
  const reportLeaves = leaves.filter((item) => getMonthKey(item.start_date) === reportMonth)
  const totalWorkSeconds = attendanceRows.filter((item) => item.type === 'check-out').reduce((sum, item) => sum + Number(item.work_seconds || 0), 0)
  const totalOvertimeHours = approvedOvertimeRows.reduce((sum, item) => sum + Number(item.hours || 0), 0)
  const totalLeaveDays = reportLeaves.filter((item) => item.status === 'approved').reduce((sum, item) => sum + Number(item.days || 0), 0)
  const calculatedPayroll = payrollRows.filter((item) => item.id)
  const totalNetSalary = calculatedPayroll.reduce((sum, item) => sum + Number(item.net_salary || 0), 0)
  const employeeName = (item) => item.full_name || item.email || `พนักงาน #${item.user_id || item.id || '-'}`
  const table = (headers, rows) => `<table><thead><tr>${headers.map((header) => `<th>${escapeReportHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}" class="empty">ไม่มีข้อมูล</td></tr>`}</tbody></table>`
  const payrollTable = table(['พนักงาน', 'ทำงาน', 'ลาอนุมัติ', 'OT', 'เงินเดือนสุทธิ', 'สถานะ'], calculatedPayroll.map((item) => `<tr><td>${escapeReportHtml(employeeName(item))}<small>${escapeReportHtml(item.employee_code || item.email || '')}</small></td><td>${escapeReportHtml(Number(item.regular_hours || 0).toFixed(2))} ชม.</td><td>${escapeReportHtml(formatLeaveDays(item.leave_days))}</td><td>${escapeReportHtml(Number(item.overtime_hours || 0).toFixed(2))} ชม.</td><td class="money">${escapeReportHtml(reportMoney(item.net_salary))}</td><td>${escapeReportHtml(reportStatusLabel(item.payment_status))}</td></tr>`))
  const overtimeTable = table(['วันที่', 'พนักงาน', 'ชั่วโมง', 'อัตรา', 'ประมาณการ', 'สถานะ'], overtimeRows.map((item) => `<tr><td>${escapeReportHtml(formatDate(item.work_date))}</td><td>${escapeReportHtml(employeeName(item))}</td><td>${escapeReportHtml(Number(item.hours || 0).toFixed(2))} ชม.</td><td>${escapeReportHtml(Number(item.rate_multiplier || 0).toFixed(2))} เท่า</td><td class="money">${escapeReportHtml(reportMoney(item.estimated_pay))}</td><td>${escapeReportHtml(reportStatusLabel(item.status))}</td></tr>`))
  const leaveTable = table(['พนักงาน', 'ประเภท', 'ช่วงวันที่', 'จำนวน', 'สถานะ'], reportLeaves.map((item) => `<tr><td>${escapeReportHtml(employeeName(item))}</td><td>${escapeReportHtml(item.leave_type)}</td><td>${escapeReportHtml(`${formatDate(item.start_date)} ถึง ${formatDate(item.end_date)}`)}</td><td>${escapeReportHtml(formatLeaveDays(item.days))}</td><td>${escapeReportHtml(reportStatusLabel(item.status))}</td></tr>`))
  const attendanceTable = table(['วันที่', 'พนักงาน', 'ประเภท', 'เวลา', 'เวลาทำงานช่วงนี้'], attendanceRows.map((item) => `<tr><td>${escapeReportHtml(formatDate(item.work_date))}</td><td>${escapeReportHtml(employeeName(item))}</td><td>${item.type === 'check-in' ? 'เข้างาน' : 'ออกงาน'}</td><td>${escapeReportHtml(new Date(item.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }))} น.</td><td>${item.type === 'check-out' ? escapeReportHtml(formatAttendanceDuration(item.work_seconds)) : '-'}</td></tr>`))
  const generatedAt = formatDate(new Date(), { day: '2-digit', month: '2-digit', year: 'numeric' })

  return `<!doctype html><html lang="th"><head><meta charset="UTF-8"><title>รายงานสรุปบุคลากร - ${escapeReportHtml(formatMonth(reportMonth))}</title><style>
    *{box-sizing:border-box}body{font-family:Tahoma,"Noto Sans Thai",Arial,sans-serif;color:#172033;margin:28px;font-size:12px;line-height:1.45}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:24px 0 8px;border-bottom:2px solid #0f8b98;padding-bottom:6px}p{margin:3px 0;color:#667085}.meta{color:#667085;margin-bottom:18px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0 20px}.summary-card{border:1px solid #dce7ec;border-radius:8px;padding:10px;background:#f7fafb}.summary-card span{display:block;color:#667085;font-size:10px}.summary-card strong{display:block;font-size:16px;margin-top:4px;color:#087f8c}table{width:100%;border-collapse:collapse;margin:6px 0 16px}th,td{border:1px solid #dbe3e8;padding:7px 8px;text-align:left;vertical-align:top}th{background:#eef5f7;color:#405466;font-weight:700}td small{display:block;color:#7b8794;font-size:10px;margin-top:2px}.money{font-weight:700;color:#087f8c}.empty{text-align:center;color:#8a96a3;padding:14px}@media print{body{margin:12mm;font-size:10px}h2{page-break-after:avoid}.summary{grid-template-columns:repeat(4,1fr)}table{page-break-inside:auto}tr{page-break-inside:avoid;page-break-after:auto}}
  </style></head><body><h1>รายงานสรุปบุคลากร</h1><p class="meta">รอบเดือน ${escapeReportHtml(formatMonth(reportMonth))} · จัดทำวันที่ ${escapeReportHtml(generatedAt)}</p><div class="summary"><div class="summary-card"><span>พนักงานที่ใช้งาน</span><strong>${activeEmployees.length} คน</strong></div><div class="summary-card"><span>ชั่วโมงทำงานรวม</span><strong>${escapeReportHtml(formatAttendanceDuration(totalWorkSeconds))}</strong></div><div class="summary-card"><span>OT ที่อนุมัติ</span><strong>${totalOvertimeHours.toFixed(2)} ชม.</strong></div><div class="summary-card"><span>เงินเดือนสุทธิรวม</span><strong>${escapeReportHtml(reportMoney(totalNetSalary))}</strong></div></div><p>วันลาที่อนุมัติในรอบเดือน: <strong>${escapeReportHtml(formatLeaveDays(totalLeaveDays))}</strong></p><h2>สรุปเงินเดือน</h2>${payrollTable}<h2>รายการ OT</h2>${overtimeTable}<h2>รายการลา</h2>${leaveTable}<h2>รายการลงเวลา</h2>${attendanceTable}</body></html>`
}

function exportReportExcel(data) {
  const blob = new Blob([`\uFEFF${buildReportHtml(data)}`], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `รายงานบุคลากร-${data.reportMonth}.xls`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportReportPdf(data) {
  const popup = window.open('', '_blank', 'width=1200,height=900')
  if (!popup) {
    window.alert('เบราว์เซอร์บล็อกหน้าต่างรายงาน กรุณาอนุญาต Pop-up แล้วลองใหม่')
    return
  }
  popup.document.open()
  popup.document.write(buildReportHtml(data))
  popup.document.close()
  popup.focus()
  window.setTimeout(() => popup.print(), 350)
}

export default function AdminPage({ onNavigate, onLogout, user }) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [dashboard, setDashboard] = useState({ totalEmployees: 0, presentToday: 0, presentPercent: 0, pendingLeaves: 0 })
  const [employees, setEmployees] = useState([])
  const [leaves, setLeaves] = useState([])
  const [attendanceRows, setAttendanceRows] = useState([])
  const [reportAttendanceRows, setReportAttendanceRows] = useState([])
  const [attendanceHistory, setAttendanceHistory] = useState([])
  const [attendanceFilters, setAttendanceFilters] = useState({ userId: '', startDate: `${currentMonth}-01`, endDate: today })
  const [overtimeRows, setOvertimeRows] = useState([])
  const [payrollRows, setPayrollRows] = useState([])
  const [payrollMonth, setPayrollMonth] = useState(currentMonth)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState(null)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [quotaForm, setQuotaForm] = useState({ userId: '', leaveType: 'ลาป่วย', quotaDays: 30, year: new Date().getFullYear() + 543 })
  const [otForm, setOtForm] = useState({ userId: '', workDate: today, hours: 1, rateMultiplier: 1.5, note: '' })

  useEffect(() => { loadData(currentMonth) }, [])

  useEffect(() => {
    if (activeTab !== 'attendance') return undefined
    const refreshAttendance = async () => {
      try {
        const attendanceData = await apiRequest('/attendance/today')
        setAttendanceRows(attendanceData.rows || [])
      } catch (requestError) {
        setError(requestError.message)
      }
    }
    refreshAttendance()
    const timer = window.setInterval(refreshAttendance, 10000)
    return () => window.clearInterval(timer)
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'attendance') return undefined
    loadAttendanceHistory()
    return undefined
  }, [activeTab])

  async function loadData(month = payrollMonth) {
    setLoading(true)
    setError('')
    try {
      const [summary, userData, leaveData, attendanceData, reportAttendanceData, overtimeData, payrollData] = await Promise.all([
        apiRequest('/dashboard/summary'), apiRequest('/users'), apiRequest('/leaves/admin'), apiRequest('/attendance/today'),
        apiRequest(`/attendance/admin/history?startDate=${month}-01&endDate=${getMonthEndDate(month)}`),
        apiRequest(`/overtime/admin?month=${month}`), apiRequest(`/payrolls/admin?month=${month}`),
      ])
      setDashboard(summary); setEmployees(userData.rows || []); setLeaves(leaveData.rows || []); setAttendanceRows(attendanceData.rows || [])
      setReportAttendanceRows(reportAttendanceData.rows || [])
      setOvertimeRows(overtimeData.rows || []); setPayrollRows(payrollData.rows || [])
      setQuotaForm((current) => ({ ...current, userId: current.userId || userData.rows?.find((item) => item.role === 'employee')?.id || '' }))
      setOtForm((current) => ({ ...current, userId: current.userId || userData.rows?.find((item) => item.role === 'employee')?.id || '' }))
    } catch (requestError) { setError(requestError.message) } finally { setLoading(false) }
  }

  async function loadAttendanceHistory(filters = attendanceFilters) {
    const params = new URLSearchParams()
    if (filters.userId) params.set('userId', filters.userId)
    if (filters.startDate) params.set('startDate', filters.startDate)
    if (filters.endDate) params.set('endDate', filters.endDate)
    try {
      const result = await apiRequest(`/attendance/admin/history?${params.toString()}`)
      setAttendanceHistory(result.rows || [])
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const updateLeave = async (id, status) => {
    setActionId(id); setError(''); setMessage('')
    try { const result = await apiRequest(`/leaves/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); setMessage(result.message); await loadData() }
    catch (requestError) { setError(requestError.message) } finally { setActionId(null) }
  }

  const editEmployee = async (employee) => {
    const fullName = window.prompt('กรอกชื่อ-นามสกุลใหม่ของพนักงาน:', employee.full_name)
    if (!fullName?.trim()) return
    try { const result = await apiRequest(`/users/${employee.id}`, { method: 'PATCH', body: JSON.stringify({ fullName: fullName.trim() }) }); setMessage(result.message); await loadData() }
    catch (requestError) { setError(requestError.message) }
  }

  const editWage = async (employee) => {
    const wageType = window.prompt('ประเภทค่าจ้าง: hourly, daily หรือ monthly', employee.wage_type || 'hourly')
    if (!['hourly', 'daily', 'monthly'].includes(wageType)) return setError('ประเภทค่าจ้างต้องเป็น hourly, daily หรือ monthly')
    const wageRate = window.prompt(`อัตราค่าจ้าง (${wageTypeLabels[wageType]})`, employee.wage_rate || 50)
    if (wageRate === null || Number(wageRate) < 0) return
    try { const result = await apiRequest(`/users/${employee.id}`, { method: 'PATCH', body: JSON.stringify({ wageType, wageRate: Number(wageRate) }) }); setMessage(result.message); await loadData() }
    catch (requestError) { setError(requestError.message) }
  }

  const deleteEmployee = async (employee) => {
    if (!window.confirm(`ต้องการลบ ${employee.full_name} ออกจากการใช้งานหรือไม่? ระบบจะเก็บประวัติเดิมไว้`)) return
    try {
      const result = await apiRequest(`/users/${employee.id}`, { method: 'DELETE' })
      setMessage(result.message)
      if (selectedEmployee?.id === employee.id) setSelectedEmployee(null)
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const editAttendance = async (item) => {
    const currentValue = formatBuddhistDateTimeInput(item.timestamp)
    const input = window.prompt(`แก้เวลา${item.type === 'check-in' ? 'เข้างาน' : 'ออกงาน'} ของ ${item.full_name}\nรูปแบบ วว/ดด/พ.ศ. HH:mm`, currentValue)
    if (!input) return
    const timestamp = parseBuddhistDateTimeInput(input)
    if (!timestamp) {
      setError('รูปแบบเวลาต้องเป็น วว/ดด/พ.ศ. HH:mm เช่น 16/09/2569 09:00')
      return
    }
    try {
      const result = await apiRequest(`/attendance/${item.id}`, { method: 'PATCH', body: JSON.stringify({ timestamp }) })
      setMessage(result.message)
      await loadAttendanceHistory()
      await loadData(payrollMonth)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const updateQuota = async (event) => {
    event.preventDefault(); if (!quotaForm.userId) return
    try { const result = await apiRequest(`/leaves/quotas/${quotaForm.userId}`, { method: 'PUT', body: JSON.stringify({ leaveType: quotaForm.leaveType, quotaDays: Number(quotaForm.quotaDays), year: Number(quotaForm.year) - 543 }) }); setMessage(result.message) }
    catch (requestError) { setError(requestError.message) }
  }

  const addOvertime = async (event) => {
    event.preventDefault(); setError(''); setMessage('')
    try {
      const result = await apiRequest('/overtime', { method: 'POST', body: JSON.stringify({ ...otForm, userId: Number(otForm.userId), hours: Number(otForm.hours), rateMultiplier: Number(otForm.rateMultiplier) }) })
      setMessage(result.message); setOtForm((current) => ({ ...current, hours: 1, note: '' })); await loadData(payrollMonth)
    } catch (requestError) { setError(requestError.message) }
  }

  const deleteOvertime = async (id) => {
    if (!window.confirm('ต้องการลบรายการ OT นี้หรือไม่?')) return
    try { const result = await apiRequest(`/overtime/${id}`, { method: 'DELETE' }); setMessage(result.message); await loadData(payrollMonth) }
    catch (requestError) { setError(requestError.message) }
  }

  const calculatePayroll = async () => {
    setError(''); setMessage('')
    try { const result = await apiRequest('/payrolls/calculate', { method: 'POST', body: JSON.stringify({ month: payrollMonth }) }); setMessage(result.message); await loadData(payrollMonth) }
    catch (requestError) { setError(requestError.message) }
  }

  const updatePayrollStatus = async (id, status) => {
    setActionId(id)
    try { const result = await apiRequest(`/payrolls/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); setMessage(result.message); await loadData(payrollMonth) }
    catch (requestError) { setError(requestError.message) } finally { setActionId(null) }
  }

  const visibleEmployees = useMemo(() => employees.filter((item) => `${item.full_name} ${item.email} ${item.employee_code}`.toLowerCase().includes(search.toLowerCase())), [employees, search])
  const pendingLeaves = leaves.filter((item) => item.status === 'pending')
  const logout = () => (onLogout ? onLogout() : onNavigate('/'))
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

  return <main className="min-h-screen bg-slate-100"><aside className="sticky top-0 z-20 border-b border-slate-200 bg-white shadow-sm"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 md:px-8"><BrandMark /><nav className="flex flex-1 items-center justify-end gap-1 overflow-x-auto md:gap-2">{menu.map(([key, icon, label]) => <button key={key} type="button" onClick={() => { setActiveTab(key); setSelectedEmployee(null) }} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition md:px-4 md:py-2.5 md:text-sm ${activeTab === key ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}><span className="text-base">{icon}</span>{label}</button>)}</nav></div></aside><section className="min-w-0"><header className="sticky top-[73px] z-10 flex h-16 items-center justify-between border-b border-slate-100 bg-white/95 px-4 backdrop-blur md:px-8"><div className="w-full max-w-md"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาพนักงานหรือรหัส..." className="w-full rounded-xl bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20" /></div><div className="ml-3 flex items-center gap-3"><span className="hidden text-sm font-bold text-slate-800 sm:inline">{user?.full_name || 'ผู้ดูแลระบบ'}</span><button type="button" onClick={logout} className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-100">ออกจากระบบ</button></div></header><div className="mx-auto max-w-7xl space-y-8 p-4 md:p-8"><div className="hidden">{menu.map(([key, icon, label]) => <button key={key} type="button" onClick={() => setActiveTab(key)}>{icon} {label}</button>)}</div>{error && <p className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}{message && <p className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">{message}</p>}{loading ? <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-400">กำลังโหลดข้อมูล...</p> : <>{activeTab === 'dashboard' && <Dashboard dashboard={dashboard} leaves={leaves} pendingLeaves={pendingLeaves} onUpdate={updateLeave} onDownloadAttachment={downloadAttachment} actionId={actionId} reportMonth={payrollMonth} setReportMonth={setPayrollMonth} onLoadReport={() => loadData(payrollMonth)} employees={employees} attendanceRows={reportAttendanceRows} overtimeRows={overtimeRows} payrollRows={payrollRows} />} {activeTab === 'employees' && (selectedEmployee ? <EmployeeProfile employee={selectedEmployee} leaves={leaves} attendanceRows={attendanceRows} overtimeRows={overtimeRows} payrollRows={payrollRows} onBack={() => setSelectedEmployee(null)} onEdit={editEmployee} onEditWage={editWage} onDownloadAttachment={downloadAttachment} /> : <EmployeeTable employees={visibleEmployees} onEdit={editEmployee} onEditWage={editWage} onDelete={deleteEmployee} onView={setSelectedEmployee} quotaForm={quotaForm} setQuotaForm={setQuotaForm} onUpdateQuota={updateQuota} />)} {activeTab === 'attendance' && <><AttendanceTable rows={attendanceRows} /><AttendanceHistoryAdmin employees={employees} rows={attendanceHistory} filters={attendanceFilters} setFilters={setAttendanceFilters} onLoad={() => loadAttendanceHistory()} onEdit={editAttendance} /></>} {activeTab === 'overtime' && <OvertimePage employees={employees} rows={overtimeRows} form={otForm} setForm={setOtForm} onSubmit={addOvertime} onDelete={deleteOvertime} month={payrollMonth} setMonth={setPayrollMonth} onLoad={() => loadData(payrollMonth)} />} {activeTab === 'payroll' && <PayrollPage rows={payrollRows} month={payrollMonth} setMonth={setPayrollMonth} onLoad={() => loadData(payrollMonth)} onCalculate={calculatePayroll} onStatus={updatePayrollStatus} actionId={actionId} />}</>}</div></section></main>
}

function Dashboard({ dashboard, leaves, pendingLeaves, onUpdate, onDownloadAttachment, actionId, reportMonth, setReportMonth, onLoadReport, employees, attendanceRows, overtimeRows, payrollRows }) {
  return <div className="space-y-8"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="พนักงานทั้งหมด" value={dashboard.totalEmployees} icon="♟" color="blue" /><Metric label="มาทำงานจริงวันนี้" value={dashboard.presentToday} icon="✓" color="emerald" /><Metric label="% พนักงานมาทำงาน" value={`${dashboard.presentPercent}%`} icon="↗" color="blue" /><Metric label="คำขอรออนุมัติ" value={dashboard.pendingLeaves} icon="◷" color="amber" /></div><ReportsPanel reportMonth={reportMonth} setReportMonth={setReportMonth} onLoadReport={onLoadReport} employees={employees} leaves={leaves} attendanceRows={attendanceRows} overtimeRows={overtimeRows} payrollRows={payrollRows} /><section className="space-y-4"><h2 className="flex items-center gap-2 text-base font-bold text-slate-800">✉ คำขอลาที่รอดำเนินการ</h2><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{pendingLeaves.length === 0 ? <p className="rounded-2xl border border-slate-100 bg-white p-5 text-xs text-slate-400">ไม่มีคำขอลาที่รอดำเนินการ</p> : pendingLeaves.map((item) => <div key={item.id} className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="text-sm font-bold text-slate-800">{item.full_name}</h3><p className="text-[10px] text-slate-400">{item.email}</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-600">{item.leave_type}</span></div><p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">เหตุผล: {item.reason} ({formatLeaveDays(item.days)})</p>{item.attachment_original_name && <button type="button" onClick={() => onDownloadAttachment(item.id, item.attachment_original_name)} className="text-left text-[10px] font-semibold text-blue-600 hover:underline">📎 {item.attachment_original_name}</button>}<LeaveQuotaSummary quotas={item.remaining_quotas} /><div className="grid grid-cols-2 gap-2"><button disabled={actionId === item.id} type="button" onClick={() => onUpdate(item.id, 'approved')} className="rounded-xl bg-blue-600 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">✓ อนุมัติ</button><button disabled={actionId === item.id} type="button" onClick={() => onUpdate(item.id, 'rejected')} className="rounded-xl bg-slate-100 py-2 text-xs font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">× ปฏิเสธ</button></div></div>)}</div></section><section className="overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h2 className="mb-4 text-base font-bold text-slate-800">ประวัติการยื่นใบลาล่าสุด</h2><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="border-b border-slate-100 text-slate-400"><tr><th className="pb-3">พนักงาน</th><th className="pb-3">ประเภท</th><th className="pb-3">เหตุผล</th><th className="pb-3">สถานะ</th><th className="pb-3">จัดการ</th></tr></thead><tbody className="divide-y divide-slate-50">{leaves.map((item) => <tr key={item.id}><td className="py-3 font-medium">{item.full_name}<div className="text-[10px] font-normal text-slate-400">{item.email}</div></td><td className="py-3 text-slate-500">{item.leave_type}</td><td className="py-3 text-slate-500">{item.reason}</td><td className="py-3"><StatusBadge status={item.status} /></td><td className="py-3"><select value={item.status} disabled={item.status === 'cancelled'} onChange={(event) => onUpdate(item.id, event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-[11px]"><option value="pending">รออนุมัติ</option><option value="approved">อนุมัติแล้ว</option><option value="rejected">ปฏิเสธ</option><option value="cancelled">ยกเลิกแล้ว</option></select></td></tr>)}</tbody></table></div></section></div>
}

function ReportsPanel({ reportMonth, setReportMonth, onLoadReport, employees, leaves, attendanceRows, overtimeRows, payrollRows }) {
  const calculatedPayroll = payrollRows.filter((item) => item.id)
  const reportData = { reportMonth, employees, leaves, attendanceRows, overtimeRows, payrollRows }

  return <section className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm md:p-6"><div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">รายงาน</p><h2 className="mt-1 text-lg font-bold text-slate-800">รายงานสรุปบุคลากร</h2><p className="mt-1 text-xs text-slate-400">รวมข้อมูลลงเวลา การลา OT และเงินเดือนของเดือนที่เลือก</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => exportReportExcel(reportData)} className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700">ดาวน์โหลด Excel</button><button type="button" onClick={() => exportReportPdf(reportData)} className="rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white hover:bg-slate-700">พิมพ์ / บันทึก PDF</button></div></div><MonthToolbar month={reportMonth} setMonth={setReportMonth} onLoad={onLoadReport} /><div className="overflow-x-auto rounded-xl border border-slate-100"><div className="border-b border-slate-100 bg-slate-50 px-4 py-3"><h3 className="text-sm font-bold text-slate-800">สรุปเงินเดือน {formatMonth(reportMonth)}</h3><p className="mt-1 text-[11px] text-slate-400">ถ้ายังไม่คำนวณเงินเดือน ระบบจะแสดงเฉพาะข้อมูลที่มีอยู่จริง</p></div><table className="w-full min-w-[820px] text-left text-xs"><thead className="border-b border-slate-100 text-slate-400"><tr><th className="p-3">พนักงาน</th><th className="p-3">ทำงาน</th><th className="p-3">ลาอนุมัติ</th><th className="p-3">OT</th><th className="p-3">เงินเดือนสุทธิ</th><th className="p-3">สถานะ</th></tr></thead><tbody className="divide-y divide-slate-50">{calculatedPayroll.length === 0 ? <tr><td colSpan="6" className="p-6 text-center text-slate-400">ยังไม่มีข้อมูลเงินเดือนของเดือนนี้</td></tr> : calculatedPayroll.map((item) => <tr key={item.id}><td className="p-3 font-medium">{item.full_name}<div className="text-[10px] font-normal text-slate-400">{item.employee_code || item.email}</div></td><td className="p-3">{Number(item.regular_hours || 0).toFixed(2)} ชม.</td><td className="p-3">{formatLeaveDays(item.leave_days)}</td><td className="p-3">{Number(item.overtime_hours || 0).toFixed(2)} ชม.</td><td className="p-3 font-bold text-teal-700">฿{formatMoney(item.net_salary)}</td><td className="p-3"><StatusBadge status={item.payment_status} /></td></tr>)}</tbody></table></div></section>
}

function LeaveQuotaSummary({ quotas = {} }) {
  const items = [['ลาป่วย', 'ลาป่วย'], ['ลากิจ', 'ลากิจ'], ['ลาพักร้อน', 'ลาพักร้อน']]
  return <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3"><div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-semibold text-blue-800">โควต้าคงเหลือ</p><p className="text-[9px] text-blue-500">รวมใบลารออนุมัติ</p></div><div className="grid grid-cols-3 gap-2">{items.map(([label, key]) => <div key={key} className="rounded-lg bg-white/80 p-2 text-center"><p className="text-[9px] text-slate-400">{label}</p><p className="mt-1 text-xs font-bold text-slate-700">{formatLeaveDays(quotas[key] ?? 0)}</p></div>)}</div></div>
}

function Metric({ label, value, icon, color }) {
  const colors = { blue: 'text-blue-600 bg-blue-50', emerald: 'text-emerald-600 bg-emerald-50', amber: 'text-amber-500 bg-amber-50' }
  return <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><div><p className="text-[11px] text-slate-400">{label}</p><strong className="mt-1 block text-2xl text-slate-800">{value}</strong></div><span className={`flex h-10 w-10 items-center justify-center rounded-2xl text-lg ${colors[color]}`}>{icon}</span></div>
}

function EmployeeTableLegacy({ employees, onEdit, onEditWage, onDelete, quotaForm, setQuotaForm, onUpdateQuota }) {
  return <section className="space-y-5"><div><h2 className="text-lg font-bold text-slate-800">รายชื่อพนักงานทั้งหมด</h2><p className="text-xs text-slate-400">จัดการข้อมูล โควตาวันลา และค่าจ้าง</p></div><div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-slate-50 text-slate-400"><tr><th className="p-4">ชื่อ-นามสกุล / อีเมล</th><th className="p-4">รหัสพนักงาน</th><th className="p-4">สิทธิ์ระบบ</th><th className="p-4">ค่าจ้าง</th><th className="p-4">สถานะ</th><th className="p-4">จัดการ</th></tr></thead><tbody className="divide-y divide-slate-50">{employees.length === 0 ? <tr><td colSpan="6" className="p-6 text-center text-slate-400">ไม่พบข้อมูล</td></tr> : employees.map((item) => <tr key={item.id}><td className="p-4 font-medium">{item.full_name}<div className="text-[10px] font-normal text-slate-400">{item.email}</div></td><td className="p-4 font-mono text-slate-500">{item.employee_code || '-'}</td><td className="p-4">{item.role === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงานประจำร้าน'}</td><td className="p-4"><span className="font-semibold">{formatMoney(item.wage_rate)}</span><div className="text-[10px] text-slate-400">{wageTypeLabels[item.wage_type] || 'รายชั่วโมง'}</div></td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${item.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{item.status === 'active' ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</span></td><td className="space-x-1 p-4"><button type="button" onClick={() => onEdit(item)} className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600">แก้ชื่อ</button><button type="button" onClick={() => onEditWage(item)} className="rounded-lg p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-600">แก้ค่าจ้าง</button><button type="button" onClick={() => onDelete(item)} className="rounded-lg p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600">ลบพนักงาน</button></td></tr>)}</tbody></table></div><form onSubmit={onUpdateQuota} className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div><h3 className="text-sm font-bold text-slate-800">กำหนดโควตาวันลา</h3><p className="text-[11px] text-slate-400">กรอกปี พ.ศ. เช่น 2569 และกำหนดจำนวนวันลาต่อปี</p></div><div className="grid gap-2 md:grid-cols-4"><select required value={quotaForm.userId} onChange={(event) => setQuotaForm((current) => ({ ...current, userId: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs"><option value="">เลือกพนักงาน</option>{employees.filter((item) => item.role === 'employee').map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select><select value={quotaForm.leaveType} onChange={(event) => setQuotaForm((current) => ({ ...current, leaveType: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs"><option>ลาป่วย</option><option>ลากิจ</option><option>ลาพักร้อน</option><option>ลาครึ่งวัน</option></select><input required min="2500" max="2700" type="number" value={quotaForm.year} onChange={(event) => setQuotaForm((current) => ({ ...current, year: event.target.value }))} placeholder="ปี พ.ศ." className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs" /><input required min="0" max="365" step="0.5" type="number" value={quotaForm.quotaDays} onChange={(event) => setQuotaForm((current) => ({ ...current, quotaDays: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs" /></div><button type="submit" className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700">บันทึกโควตา</button></form></section>
}

function EmployeeTable({ employees, onView, ...tableProps }) {
  return <div className="space-y-5"><section className="employee-search-card rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">พนักงาน</p><h2 className="mt-1 text-base font-bold text-slate-800">เลือกดูข้อมูลพนักงาน</h2><p className="mt-1 text-xs text-slate-400">กดเลือกชื่อเพื่อดูประวัติและสรุปข้อมูลแบบละเอียด</p></div><select value="" onChange={(event) => { const employee = employees.find((item) => String(item.id) === event.target.value); if (employee) onView(employee) }} className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"><option value="">เลือกพนักงานที่ต้องการดู</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.full_name} · {item.employee_code || item.email}</option>)}</select></section><EmployeeTableLegacy employees={employees} {...tableProps} /></div>
}

function EmployeeProfile({ employee, leaves, attendanceRows, overtimeRows, payrollRows, onBack, onEdit, onEditWage, onDownloadAttachment }) {
  const [activeProfileTab, setActiveProfileTab] = useState('profile')
  const employeeLeaves = leaves.filter((item) => Number(item.user_id) === Number(employee.id))
  const employeeAttendance = attendanceRows.filter((item) => Number(item.user_id) === Number(employee.id))
  const employeeOvertime = overtimeRows.filter((item) => Number(item.user_id) === Number(employee.id))
  const employeePayrolls = payrollRows.filter((item) => Number(item.user_id) === Number(employee.id) && item.id)
  const currentPayroll = employeePayrolls[0]
  const approvedLeaveCount = employeeLeaves.filter((item) => item.status === 'approved').length
  const overtimeHours = employeeOvertime.reduce((sum, item) => sum + Number(item.hours || 0), 0)
  const initials = employee.full_name?.trim().slice(0, 1) || '?'
  const tabs = [['profile', 'ข้อมูลพนักงาน'], ['attendance', 'ประวัติลงเวลา'], ['leave', 'ประวัติการลา'], ['payroll', 'เงินเดือน']]

  return <section className="space-y-5"><button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-blue-700">← กลับรายชื่อพนักงาน</button><section className="employee-profile-card overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"><div className="employee-profile-cover" /><div className="relative px-5 pb-5 md:px-8"><div className="-mt-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div className="flex items-end gap-4"><div className="employee-avatar flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-4 border-white text-3xl font-bold text-white shadow-lg">{initials}</div><div className="pb-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold text-slate-800">{employee.full_name}</h1><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">{employee.status === 'active' ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</span></div><p className="mt-1 text-xs text-slate-400">{employee.position || 'พนักงานประจำร้าน'} · {employee.employee_code || 'ยังไม่มีรหัสพนักงาน'}</p><p className="mt-1 text-xs text-slate-500">✉ {employee.email}</p></div></div><div className="flex gap-2"><button type="button" onClick={() => onEdit(employee)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">แก้ข้อมูล</button><button type="button" onClick={() => onEditWage(employee)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">แก้ค่าจ้าง</button></div></div><div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 md:grid-cols-4"><ProfileStat label="วันลาที่อนุมัติ" value={`${approvedLeaveCount} รายการ`} icon="▣" /><ProfileStat label="ชั่วโมง OT เดือนนี้" value={`${overtimeHours.toFixed(2)} ชม.`} icon="＋" /><ProfileStat label="เงินเดือนงวดนี้" value={currentPayroll ? `฿${formatMoney(currentPayroll.net_salary)}` : '-'} icon="฿" /><ProfileStat label="สิทธิ์ระบบ" value={employee.role === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงาน'} icon="♙" /></div></div></section><nav className="profile-tabs flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">{tabs.map(([key, label]) => <button key={key} type="button" onClick={() => setActiveProfileTab(key)} className={`shrink-0 rounded-lg px-4 py-2.5 text-xs font-semibold transition ${activeProfileTab === key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{label}</button>)}</nav>{activeProfileTab === 'profile' && <ProfileInfo employee={employee} />}{activeProfileTab === 'attendance' && <ProfileAttendance rows={employeeAttendance} />}{activeProfileTab === 'leave' && <ProfileLeaves rows={employeeLeaves} onDownloadAttachment={onDownloadAttachment} />}{activeProfileTab === 'payroll' && <ProfilePayroll payroll={currentPayroll} />}</section>
}

function ProfileStat({ label, value, icon }) {
  return <div className="rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between"><p className="text-[10px] text-slate-400">{label}</p><span className="text-sm text-blue-600">{icon}</span></div><p className="mt-2 text-sm font-bold text-slate-800">{value}</p></div>
}

function ProfileInfo({ employee }) {
  return <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm md:p-7"><div className="mb-5"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">ข้อมูลสำคัญ</p><h2 className="mt-1 text-base font-bold text-slate-800">ข้อมูลส่วนตัวและการทำงาน</h2></div><div className="grid gap-5 md:grid-cols-2"><ProfileField label="ชื่อ-นามสกุล" value={employee.full_name} /><ProfileField label="อีเมล" value={employee.email} /><ProfileField label="รหัสพนักงาน" value={employee.employee_code || '-'} /><ProfileField label="ตำแหน่ง" value={employee.position || '-'} /><ProfileField label="ประเภทค่าจ้าง" value={wageTypeLabels[employee.wage_type] || '-'} /><ProfileField label="อัตราค่าจ้าง" value={`${formatMoney(employee.wage_rate)} บาท`} /></div></section>
}

function ProfileField({ label, value }) {
  return <div className="border-b border-slate-100 pb-3"><p className="text-[10px] text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-700">{value}</p></div>
}

function ProfileAttendance({ rows }) {
  return <ProfileList title="การลงเวลาวันนี้" subtitle="ข้อมูลที่ Admin โหลดไว้สำหรับวันนี้" empty="วันนี้ยังไม่มีข้อมูลลงเวลา">{rows.map((item) => <div key={item.user_id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0"><div><p className="text-sm font-semibold text-slate-700">{item.first_check_in ? new Date(item.first_check_in).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'} น. เข้างานครั้งแรก</p><p className="text-xs text-slate-400">ชั่วโมงทำงาน {Number(item.work_hours || 0).toFixed(2)} ชม.</p></div><StatusBadge status={item.current_type === 'check-in' ? 'working' : 'finished'} /></div>)}</ProfileList>
}

function ProfileLeaves({ rows, onDownloadAttachment }) {
  return <ProfileList title="ประวัติการลา" subtitle="รายการใบลาของพนักงานคนนี้" empty="ยังไม่มีรายการใบลา">{rows.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0"><div><p className="text-sm font-semibold text-slate-700">{item.leave_type} · {formatLeaveDays(item.days)}</p><p className="text-xs text-slate-400">{formatDate(item.start_date)} ถึง {formatDate(item.end_date)}</p>{item.attachment_original_name && <button type="button" onClick={() => onDownloadAttachment(item.id, item.attachment_original_name)} className="mt-1 text-[10px] font-semibold text-blue-600 hover:underline">📎 {item.attachment_original_name}</button>}</div><StatusBadge status={item.status} /></div>)}</ProfileList>
}

function ProfilePayroll({ payroll }) {
  return <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm md:p-7"><div className="mb-5"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Payroll</p><h2 className="mt-1 text-base font-bold text-slate-800">เงินเดือนงวดล่าสุดที่โหลดไว้</h2></div>{payroll ? <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4"><ProfileField label="รอบเงินเดือน" value={formatMonth(payroll.payroll_month)} /><ProfileField label="ค่าแรงปกติ" value={`฿${formatMoney(payroll.regular_pay)}`} /><ProfileField label="OT" value={`฿${formatMoney(payroll.overtime_pay)}`} /><ProfileField label="รับสุทธิ" value={`฿${formatMoney(payroll.net_salary)}`} /></div> : <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-400">ยังไม่มีข้อมูลเงินเดือนของงวดนี้</p>}</section>
}

function ProfileList({ title, subtitle, empty, children }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm md:p-7"><div className="mb-3"><h2 className="text-base font-bold text-slate-800">{title}</h2><p className="text-xs text-slate-400">{subtitle}</p></div>{hasChildren ? children : <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-400">{empty}</p>}</section>
}

function AttendanceHistoryAdmin({ employees, rows, filters, setFilters, onLoad, onEdit }) {
  const [dateInputs, setDateInputs] = useState({
    startDate: formatBuddhistDateInput(filters.startDate),
    endDate: formatBuddhistDateInput(filters.endDate),
  })

  const updateDateInput = (key, value) => {
    setDateInputs((current) => ({ ...current, [key]: value }))
    const parsedDate = parseBuddhistDateInput(value)
    if (parsedDate) setFilters((current) => ({ ...current, [key]: parsedDate }))
  }

  return <section className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
    <div>
      <h2 className="text-base font-bold text-slate-800">ประวัติลงเวลาย้อนหลัง</h2>
      <p className="text-xs text-slate-400">ค้นหาและแก้ไขเวลาเข้า–ออกของพนักงาน โดยระบบจะคำนวณชั่วโมงและครึ่งวันใหม่</p>
    </div>
    <div className="grid gap-2 md:grid-cols-4">
      <label className="text-xs font-semibold text-slate-600">พนักงาน
        <select value={filters.userId} onChange={(event) => setFilters((current) => ({ ...current, userId: event.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs">
          <option value="">พนักงานทั้งหมด</option>
          {employees.filter((item) => item.role === 'employee').map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold text-slate-600">ตั้งแต่
        <input type="text" inputMode="numeric" placeholder="วว/ดด/พ.ศ." value={dateInputs.startDate} onChange={(event) => updateDateInput('startDate', event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs" />
      </label>
      <label className="text-xs font-semibold text-slate-600">ถึง
        <input type="text" inputMode="numeric" placeholder="วว/ดด/พ.ศ." value={dateInputs.endDate} onChange={(event) => updateDateInput('endDate', event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs" />
      </label>
      <button type="button" onClick={onLoad} className="self-end rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-700">ค้นหาประวัติ</button>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-xs">
        <thead className="border-b border-slate-100 text-slate-400"><tr><th className="p-3">วันที่</th><th className="p-3">พนักงาน</th><th className="p-3">ประเภท</th><th className="p-3">เวลา</th><th className="p-3">ทำงานช่วงนี้</th><th className="p-3">กฎเวลา</th><th className="p-3">จัดการ</th></tr></thead>
        <tbody className="divide-y divide-slate-50">
          {rows.length === 0 ? <tr><td colSpan="7" className="p-6 text-center text-slate-400">ไม่พบประวัติในช่วงวันที่เลือก</td></tr> : rows.map((item) => <tr key={item.id}><td className="p-3 text-slate-500">{formatDate(item.work_date)}</td><td className="p-3 font-medium">{item.full_name}<div className="text-[10px] font-normal text-slate-400">{item.employee_code || item.email}</div></td><td className="p-3">{item.type === 'check-in' ? 'เข้างาน' : 'ออกงาน'}</td><td className="p-3 font-mono text-slate-500">{new Date(item.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</td><td className="p-3 text-slate-500">{item.type === 'check-out' ? formatAttendanceDuration(item.work_seconds) : '-'}</td><td className={`p-3 ${['late', 'early', 'after-hours'].includes(item.attendance_rule?.status) ? 'font-semibold text-amber-600' : 'text-emerald-600'}`}>{item.attendance_rule?.label || '-'}</td><td className="p-3"><button type="button" onClick={() => onEdit(item)} className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100">แก้เวลา</button></td></tr>)}
        </tbody>
      </table>
    </div>
  </section>
}

function AttendanceTable({ rows }) {
  return <section className="space-y-5"><div><h2 className="text-lg font-bold text-slate-800">การลงเวลาทำงานวันนี้</h2><p className="text-xs text-slate-400">รวมชั่วโมงจากทุกช่วงเวลาในวันเดียวกัน</p></div><div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-slate-50 text-slate-400"><tr><th className="p-4">เวลาเข้างานครั้งแรก</th><th className="p-4">ชื่อ-นามสกุล / อีเมล</th><th className="p-4">ชั่วโมงทำงานสะสมวันนี้</th><th className="p-4">กฎเวลา</th><th className="p-4">สถานะปัจจุบัน</th></tr></thead><tbody className="divide-y divide-slate-50">{rows.length === 0 ? <tr><td colSpan="5" className="p-6 text-center text-slate-400">วันนี้ยังไม่มีข้อมูลลงเวลา</td></tr> : rows.map((item) => <tr key={item.user_id}><td className="p-4 font-mono text-slate-500">{item.first_check_in ? new Date(item.first_check_in).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'}</td><td className="p-4 font-semibold">{item.full_name}<div className="text-[10px] font-normal text-slate-400">{item.email}</div></td><td className="p-4 text-slate-500">{Number(item.work_hours || 0).toFixed(2)} ชม. ({item.work_fraction > 0 ? formatLeaveDays(item.work_fraction) : 'ยังไม่ครบครึ่งวัน'})</td><td className="p-4"><span className={item.attendance_rule?.status === 'late' || item.attendance_rule?.status === 'early' ? 'font-semibold text-amber-600' : 'text-emerald-600'}>{item.attendance_rule?.label || '-'}</span></td><td className="p-4"><StatusBadge status={item.current_type === 'check-in' ? 'working' : 'finished'} /></td></tr>)}</tbody></table></div></section>
}

function MonthToolbar({ month, setMonth, onLoad, children }) {
  return <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><label className="text-xs font-semibold text-slate-600">เดือนที่ต้องการดู<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1 block rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs" /></label><button type="button" onClick={onLoad} className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-700">โหลดข้อมูล</button>{children}</div>
}

function OvertimePage({ employees, rows, form, setForm, onSubmit, onDelete, month, setMonth, onLoad }) {
  return <section className="space-y-5"><div><h2 className="text-lg font-bold text-slate-800">บันทึกเวลาล่วงเวลา (OT)</h2><p className="text-xs text-slate-400">รายการที่บันทึกจะถูกนำไปรวมตอนคำนวณเงินเดือน</p></div><MonthToolbar month={month} setMonth={setMonth} onLoad={onLoad} /><form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h3 className="text-sm font-bold text-slate-800">เพิ่มรายการ OT</h3><div className="grid gap-3 md:grid-cols-5"><label className="text-xs font-semibold text-slate-600 md:col-span-2">พนักงาน<select required value={form.userId} onChange={(event) => setForm((current) => ({ ...current, userId: event.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs"><option value="">เลือกพนักงาน</option>{employees.filter((item) => item.role === 'employee' && item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.full_name} ({item.employee_code || item.email})</option>)}</select></label><label className="text-xs font-semibold text-slate-600 md:col-span-1">วันที่<input required type="date" value={form.workDate} onChange={(event) => setForm((current) => ({ ...current, workDate: event.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs" />{form.workDate && <span className="mt-1 block text-[10px] font-normal text-slate-400">วันที่ไทย: {formatDate(form.workDate)}</span>}</label><label className="text-xs font-semibold text-slate-600">จำนวนชั่วโมง<input required min="0.25" max="24" step="0.25" type="number" value={form.hours} onChange={(event) => setForm((current) => ({ ...current, hours: event.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs" /></label><label className="text-xs font-semibold text-slate-600">อัตรา OT (เท่า)<input required min="1" max="3" step="0.5" type="number" value={form.rateMultiplier} onChange={(event) => setForm((current) => ({ ...current, rateMultiplier: event.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs" /></label></div><label className="block text-xs font-semibold text-slate-600">หมายเหตุ<input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="เช่น ล้างรถรอบเย็น" className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs" /></label><button type="submit" className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700">บันทึก OT</button></form><section className="overflow-x-auto rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h3 className="mb-4 text-sm font-bold text-slate-800">รายการ OT เดือน {formatMonth(month)}</h3><table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b border-slate-100 text-slate-400"><tr><th className="pb-3">วันที่</th><th className="pb-3">พนักงาน</th><th className="pb-3">ชั่วโมง</th><th className="pb-3">อัตรา</th><th className="pb-3">ประมาณการ</th><th className="pb-3">จัดการ</th></tr></thead><tbody className="divide-y divide-slate-50">{rows.length === 0 ? <tr><td colSpan="6" className="p-6 text-center text-slate-400">ยังไม่มีรายการ OT</td></tr> : rows.map((item) => <tr key={item.id}><td className="py-3">{formatDate(item.work_date)}</td><td className="py-3 font-medium">{item.full_name}<div className="text-[10px] text-slate-400">{item.employee_code || item.email}</div></td><td className="py-3">{Number(item.hours).toFixed(2)} ชม.</td><td className="py-3">{Number(item.rate_multiplier).toFixed(2)} เท่า</td><td className="py-3 font-semibold text-amber-600">฿{formatMoney(item.estimated_pay)}</td><td className="py-3"><button type="button" onClick={() => onDelete(item.id)} className="text-rose-600 hover:underline">ลบ</button></td></tr>)}</tbody></table></section></section>
}

function PayrollPage({ rows, month, setMonth, onLoad, onCalculate, onStatus, actionId }) {
  const calculatedRows = rows.filter((item) => item.id)
  const totalNet = calculatedRows.reduce((sum, item) => sum + Number(item.net_salary || 0), 0)
  return <section className="space-y-5"><div><h2 className="text-lg font-bold text-slate-800">เงินเดือนรายเดือน</h2><p className="text-xs text-slate-400">สูตรรายชั่วโมง: ชั่วโมงทำงาน × ค่าแรง + OT × อัตรา OT</p></div><MonthToolbar month={month} setMonth={setMonth} onLoad={onLoad}><button type="button" onClick={onCalculate} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700">คำนวณเงินเดือนเดือนนี้</button></MonthToolbar><div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><Metric label="พนักงานที่คำนวณแล้ว" value={`${calculatedRows.length}/${rows.length}`} icon="✓" color="emerald" /><Metric label="ยอดเงินเดือนรวม" value={`฿${formatMoney(totalNet)}`} icon="฿" color="blue" /><Metric label="จ่ายแล้ว" value={calculatedRows.filter((item) => item.payment_status === 'paid').length} icon="▣" color="amber" /></div><section className="overflow-x-auto rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div className="mb-4"><h3 className="text-sm font-bold text-slate-800">สรุปเงินเดือน {formatMonth(month)}</h3><p className="text-[11px] text-slate-400">กดอนุมัติ แล้วจึงกดบันทึกว่าจ่ายแล้ว</p></div><table className="w-full min-w-[1050px] text-left text-xs"><thead className="border-b border-slate-100 text-slate-400"><tr><th className="pb-3">พนักงาน</th><th className="pb-3">ค่าจ้าง</th><th className="pb-3">ทำงาน</th><th className="pb-3">ลาอนุมัติ</th><th className="pb-3">OT</th><th className="pb-3">ค่าแรงปกติ</th><th className="pb-3">OT เป็นเงิน</th><th className="pb-3">สุทธิ</th><th className="pb-3">สถานะ</th><th className="pb-3">จัดการ</th></tr></thead><tbody className="divide-y divide-slate-50">{rows.length === 0 ? <tr><td colSpan="10" className="p-6 text-center text-slate-400">ยังไม่มีพนักงาน</td></tr> : rows.map((item) => <tr key={item.user_id}><td className="py-3 font-medium">{item.full_name}<div className="text-[10px] text-slate-400">{item.employee_code || item.email}</div></td><td className="py-3">{formatMoney(item.wage_rate || item.current_wage_rate)}<div className="text-[10px] text-slate-400">{wageTypeLabels[item.wage_type || item.current_wage_type] || '-'}</div></td><td className="py-3">{item.id ? `${Number(item.regular_hours || 0).toFixed(2)} ชม.` : '-'}</td><td className="py-3">{item.id ? formatLeaveDays(item.leave_days) : '-'}</td><td className="py-3">{item.id ? `${Number(item.overtime_hours || 0).toFixed(2)} ชม.` : '-'}</td><td className="py-3">{item.id ? `฿${formatMoney(item.regular_pay)}` : '-'}</td><td className="py-3 text-amber-600">{item.id ? `฿${formatMoney(item.overtime_pay)}` : '-'}</td><td className="py-3 text-base font-bold text-blue-600">{item.id ? `฿${formatMoney(item.net_salary)}` : '-'}</td><td className="py-3">{item.id ? <StatusBadge status={item.payment_status} /> : <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] text-amber-700">ยังไม่คำนวณ</span>}</td><td className="py-3">{item.id && item.payment_status === 'draft' && <button disabled={actionId === item.id} type="button" onClick={() => onStatus(item.id, 'approved')} className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-700 disabled:opacity-50">อนุมัติ</button>}{item.id && item.payment_status === 'approved' && <button disabled={actionId === item.id} type="button" onClick={() => onStatus(item.id, 'paid')} className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[10px] font-semibold text-blue-700 disabled:opacity-50">จ่ายแล้ว</button>}</td></tr>)}</tbody></table></section></section>
}
