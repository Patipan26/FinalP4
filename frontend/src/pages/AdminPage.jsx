import { useEffect, useMemo, useState } from 'react'
import BrandMark from '../components/BrandMark'
import StatusBadge from '../components/StatusBadge'
import { apiRequest } from '../services/api'
import { formatLeaveDays, formatMoney, formatMonth } from '../utils/format'

const currentMonth = new Date().toISOString().slice(0, 7)
const today = new Date().toISOString().slice(0, 10)
const menu = [['dashboard', '▦', 'หน้าหลัก'], ['employees', '♟', 'พนักงาน'], ['attendance', '▣', 'ตารางงาน'], ['overtime', '＋', 'บันทึก OT'], ['payroll', '฿', 'เงินเดือน']]
const wageTypeLabels = { hourly: 'รายชั่วโมง', daily: 'รายวัน', monthly: 'รายเดือน' }

export default function AdminPage({ onNavigate, onLogout, user }) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [dashboard, setDashboard] = useState({ totalEmployees: 0, presentToday: 0, presentPercent: 0, pendingLeaves: 0 })
  const [employees, setEmployees] = useState([])
  const [leaves, setLeaves] = useState([])
  const [attendanceRows, setAttendanceRows] = useState([])
  const [overtimeRows, setOvertimeRows] = useState([])
  const [payrollRows, setPayrollRows] = useState([])
  const [payrollMonth, setPayrollMonth] = useState(currentMonth)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState(null)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [quotaForm, setQuotaForm] = useState({ userId: '', leaveType: 'ลาป่วย', quotaDays: 30 })
  const [otForm, setOtForm] = useState({ userId: '', workDate: today, hours: 1, rateMultiplier: 1.5, note: '' })

  useEffect(() => { loadData(currentMonth) }, [])

  async function loadData(month = payrollMonth) {
    setLoading(true)
    setError('')
    try {
      const [summary, userData, leaveData, attendanceData, overtimeData, payrollData] = await Promise.all([
        apiRequest('/dashboard/summary'), apiRequest('/users'), apiRequest('/leaves/admin'), apiRequest('/attendance/today'),
        apiRequest(`/overtime/admin?month=${month}`), apiRequest(`/payrolls/admin?month=${month}`),
      ])
      setDashboard(summary); setEmployees(userData.rows || []); setLeaves(leaveData.rows || []); setAttendanceRows(attendanceData.rows || [])
      setOvertimeRows(overtimeData.rows || []); setPayrollRows(payrollData.rows || [])
      setQuotaForm((current) => ({ ...current, userId: current.userId || userData.rows?.find((item) => item.role === 'employee')?.id || '' }))
      setOtForm((current) => ({ ...current, userId: current.userId || userData.rows?.find((item) => item.role === 'employee')?.id || '' }))
    } catch (requestError) { setError(requestError.message) } finally { setLoading(false) }
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

  const updateQuota = async (event) => {
    event.preventDefault(); if (!quotaForm.userId) return
    try { const result = await apiRequest(`/leaves/quotas/${quotaForm.userId}`, { method: 'PUT', body: JSON.stringify({ leaveType: quotaForm.leaveType, quotaDays: Number(quotaForm.quotaDays) }) }); setMessage(result.message) }
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

  return <main className="min-h-screen bg-slate-100"><aside className="sticky top-0 z-20 border-b border-slate-200 bg-white shadow-sm"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 md:px-8"><BrandMark /><nav className="flex flex-1 items-center justify-end gap-1 overflow-x-auto md:gap-2">{menu.map(([key, icon, label]) => <button key={key} type="button" onClick={() => { setActiveTab(key); setSelectedEmployee(null) }} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition md:px-4 md:py-2.5 md:text-sm ${activeTab === key ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}><span className="text-base">{icon}</span>{label}</button>)}</nav></div></aside><section className="min-w-0"><header className="sticky top-[73px] z-10 flex h-16 items-center justify-between border-b border-slate-100 bg-white/95 px-4 backdrop-blur md:px-8"><div className="w-full max-w-md"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาพนักงานหรือรหัส..." className="w-full rounded-xl bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20" /></div><div className="ml-3 flex items-center gap-3"><span className="hidden text-sm font-bold text-slate-800 sm:inline">{user?.full_name || 'ผู้ดูแลระบบ'}</span><button type="button" onClick={logout} className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-100">ออกจากระบบ</button></div></header><div className="mx-auto max-w-7xl space-y-8 p-4 md:p-8"><div className="hidden">{menu.map(([key, icon, label]) => <button key={key} type="button" onClick={() => setActiveTab(key)}>{icon} {label}</button>)}</div>{error && <p className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}{message && <p className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">{message}</p>}{loading ? <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-400">กำลังโหลดข้อมูล...</p> : <>{activeTab === 'dashboard' && <Dashboard dashboard={dashboard} leaves={leaves} pendingLeaves={pendingLeaves} onUpdate={updateLeave} actionId={actionId} />} {activeTab === 'employees' && (selectedEmployee ? <EmployeeProfile employee={selectedEmployee} leaves={leaves} attendanceRows={attendanceRows} overtimeRows={overtimeRows} payrollRows={payrollRows} onBack={() => setSelectedEmployee(null)} onEdit={editEmployee} onEditWage={editWage} /> : <EmployeeTable employees={visibleEmployees} onEdit={editEmployee} onEditWage={editWage} onView={setSelectedEmployee} quotaForm={quotaForm} setQuotaForm={setQuotaForm} onUpdateQuota={updateQuota} />)} {activeTab === 'attendance' && <AttendanceTable rows={attendanceRows} />} {activeTab === 'overtime' && <OvertimePage employees={employees} rows={overtimeRows} form={otForm} setForm={setOtForm} onSubmit={addOvertime} onDelete={deleteOvertime} month={payrollMonth} setMonth={setPayrollMonth} onLoad={() => loadData(payrollMonth)} />} {activeTab === 'payroll' && <PayrollPage rows={payrollRows} month={payrollMonth} setMonth={setPayrollMonth} onLoad={() => loadData(payrollMonth)} onCalculate={calculatePayroll} onStatus={updatePayrollStatus} actionId={actionId} />}</>}</div></section></main>
}

function Dashboard({ dashboard, leaves, pendingLeaves, onUpdate, actionId }) {
  return <div className="space-y-8"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="พนักงานทั้งหมด" value={dashboard.totalEmployees} icon="♟" color="blue" /><Metric label="มาทำงานจริงวันนี้" value={dashboard.presentToday} icon="✓" color="emerald" /><Metric label="% พนักงานมาทำงาน" value={`${dashboard.presentPercent}%`} icon="↗" color="blue" /><Metric label="คำขอรออนุมัติ" value={dashboard.pendingLeaves} icon="◷" color="amber" /></div><section className="space-y-4"><h2 className="flex items-center gap-2 text-base font-bold text-slate-800">✉ คำขอลาที่รอดำเนินการ</h2><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{pendingLeaves.length === 0 ? <p className="rounded-2xl border border-slate-100 bg-white p-5 text-xs text-slate-400">ไม่มีคำขอลาที่รอดำเนินการ</p> : pendingLeaves.map((item) => <div key={item.id} className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="text-sm font-bold text-slate-800">{item.full_name}</h3><p className="text-[10px] text-slate-400">{item.email}</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-600">{item.leave_type}</span></div><p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">เหตุผล: {item.reason} ({formatLeaveDays(item.days)})</p><div className="grid grid-cols-2 gap-2"><button disabled={actionId === item.id} type="button" onClick={() => onUpdate(item.id, 'approved')} className="rounded-xl bg-blue-600 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">✓ อนุมัติ</button><button disabled={actionId === item.id} type="button" onClick={() => onUpdate(item.id, 'rejected')} className="rounded-xl bg-slate-100 py-2 text-xs font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">× ปฏิเสธ</button></div></div>)}</div></section><section className="overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h2 className="mb-4 text-base font-bold text-slate-800">ประวัติการยื่นใบลาล่าสุด</h2><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="border-b border-slate-100 text-slate-400"><tr><th className="pb-3">พนักงาน</th><th className="pb-3">ประเภท</th><th className="pb-3">เหตุผล</th><th className="pb-3">สถานะ</th><th className="pb-3">จัดการ</th></tr></thead><tbody className="divide-y divide-slate-50">{leaves.map((item) => <tr key={item.id}><td className="py-3 font-medium">{item.full_name}<div className="text-[10px] font-normal text-slate-400">{item.email}</div></td><td className="py-3 text-slate-500">{item.leave_type}</td><td className="py-3 text-slate-500">{item.reason}</td><td className="py-3"><StatusBadge status={item.status} /></td><td className="py-3"><select value={item.status} disabled={item.status === 'cancelled'} onChange={(event) => onUpdate(item.id, event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-[11px]"><option value="pending">รออนุมัติ</option><option value="approved">อนุมัติแล้ว</option><option value="rejected">ปฏิเสธ</option><option value="cancelled">ยกเลิกแล้ว</option></select></td></tr>)}</tbody></table></div></section></div>
}

function Metric({ label, value, icon, color }) {
  const colors = { blue: 'text-blue-600 bg-blue-50', emerald: 'text-emerald-600 bg-emerald-50', amber: 'text-amber-500 bg-amber-50' }
  return <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><div><p className="text-[11px] text-slate-400">{label}</p><strong className="mt-1 block text-2xl text-slate-800">{value}</strong></div><span className={`flex h-10 w-10 items-center justify-center rounded-2xl text-lg ${colors[color]}`}>{icon}</span></div>
}

function EmployeeTableLegacy({ employees, onEdit, onEditWage, quotaForm, setQuotaForm, onUpdateQuota }) {
  return <section className="space-y-5"><div><h2 className="text-lg font-bold text-slate-800">รายชื่อพนักงานทั้งหมด</h2><p className="text-xs text-slate-400">จัดการข้อมูล โควตาวันลา และค่าจ้าง</p></div><div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-slate-50 text-slate-400"><tr><th className="p-4">ชื่อ-นามสกุล / อีเมล</th><th className="p-4">รหัสพนักงาน</th><th className="p-4">สิทธิ์ระบบ</th><th className="p-4">ค่าจ้าง</th><th className="p-4">สถานะ</th><th className="p-4">จัดการ</th></tr></thead><tbody className="divide-y divide-slate-50">{employees.length === 0 ? <tr><td colSpan="6" className="p-6 text-center text-slate-400">ไม่พบข้อมูล</td></tr> : employees.map((item) => <tr key={item.id}><td className="p-4 font-medium">{item.full_name}<div className="text-[10px] font-normal text-slate-400">{item.email}</div></td><td className="p-4 font-mono text-slate-500">{item.employee_code || '-'}</td><td className="p-4">{item.role === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงานประจำร้าน'}</td><td className="p-4"><span className="font-semibold">{formatMoney(item.wage_rate)}</span><div className="text-[10px] text-slate-400">{wageTypeLabels[item.wage_type] || 'รายชั่วโมง'}</div></td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${item.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{item.status === 'active' ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</span></td><td className="space-x-1 p-4"><button type="button" onClick={() => onEdit(item)} className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600">แก้ชื่อ</button><button type="button" onClick={() => onEditWage(item)} className="rounded-lg p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-600">แก้ค่าจ้าง</button></td></tr>)}</tbody></table></div><form onSubmit={onUpdateQuota} className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div><h3 className="text-sm font-bold text-slate-800">กำหนดโควตาวันลา</h3><p className="text-[11px] text-slate-400">ลาครึ่งวันจะหักโควตาเป็นครึ่งวัน</p></div><div className="grid gap-2 md:grid-cols-3"><select required value={quotaForm.userId} onChange={(event) => setQuotaForm((current) => ({ ...current, userId: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs"><option value="">เลือกพนักงาน</option>{employees.filter((item) => item.role === 'employee').map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select><select value={quotaForm.leaveType} onChange={(event) => setQuotaForm((current) => ({ ...current, leaveType: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs"><option>ลาป่วย</option><option>ลากิจ</option><option>ลาพักร้อน</option><option>ลาครึ่งวัน</option></select><input required min="0" max="365" step="0.5" type="number" value={quotaForm.quotaDays} onChange={(event) => setQuotaForm((current) => ({ ...current, quotaDays: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs" /></div><button type="submit" className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700">บันทึกโควตา</button></form></section>
}

function EmployeeTable({ employees, onView, ...tableProps }) {
  return <div className="space-y-5"><section className="employee-search-card rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">พนักงาน</p><h2 className="mt-1 text-base font-bold text-slate-800">เลือกดูข้อมูลพนักงาน</h2><p className="mt-1 text-xs text-slate-400">กดเลือกชื่อเพื่อดูประวัติและสรุปข้อมูลแบบละเอียด</p></div><select value="" onChange={(event) => { const employee = employees.find((item) => String(item.id) === event.target.value); if (employee) onView(employee) }} className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"><option value="">เลือกพนักงานที่ต้องการดู</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.full_name} · {item.employee_code || item.email}</option>)}</select></section><EmployeeTableLegacy employees={employees} {...tableProps} /></div>
}

function EmployeeProfile({ employee, leaves, attendanceRows, overtimeRows, payrollRows, onBack, onEdit, onEditWage }) {
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

  return <section className="space-y-5"><button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-blue-700">← กลับรายชื่อพนักงาน</button><section className="employee-profile-card overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"><div className="employee-profile-cover" /><div className="relative px-5 pb-5 md:px-8"><div className="-mt-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div className="flex items-end gap-4"><div className="employee-avatar flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-4 border-white text-3xl font-bold text-white shadow-lg">{initials}</div><div className="pb-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold text-slate-800">{employee.full_name}</h1><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">{employee.status === 'active' ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</span></div><p className="mt-1 text-xs text-slate-400">{employee.position || 'พนักงานประจำร้าน'} · {employee.employee_code || 'ยังไม่มีรหัสพนักงาน'}</p><p className="mt-1 text-xs text-slate-500">✉ {employee.email}</p></div></div><div className="flex gap-2"><button type="button" onClick={() => onEdit(employee)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">แก้ข้อมูล</button><button type="button" onClick={() => onEditWage(employee)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">แก้ค่าจ้าง</button></div></div><div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 md:grid-cols-4"><ProfileStat label="วันลาที่อนุมัติ" value={`${approvedLeaveCount} รายการ`} icon="▣" /><ProfileStat label="ชั่วโมง OT เดือนนี้" value={`${overtimeHours.toFixed(2)} ชม.`} icon="＋" /><ProfileStat label="เงินเดือนงวดนี้" value={currentPayroll ? `฿${formatMoney(currentPayroll.net_salary)}` : '-'} icon="฿" /><ProfileStat label="สิทธิ์ระบบ" value={employee.role === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงาน'} icon="♙" /></div></div></section><nav className="profile-tabs flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">{tabs.map(([key, label]) => <button key={key} type="button" onClick={() => setActiveProfileTab(key)} className={`shrink-0 rounded-lg px-4 py-2.5 text-xs font-semibold transition ${activeProfileTab === key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{label}</button>)}</nav>{activeProfileTab === 'profile' && <ProfileInfo employee={employee} />}{activeProfileTab === 'attendance' && <ProfileAttendance rows={employeeAttendance} />}{activeProfileTab === 'leave' && <ProfileLeaves rows={employeeLeaves} />}{activeProfileTab === 'payroll' && <ProfilePayroll payroll={currentPayroll} />}</section>
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

function ProfileLeaves({ rows }) {
  return <ProfileList title="ประวัติการลา" subtitle="รายการใบลาของพนักงานคนนี้" empty="ยังไม่มีรายการใบลา">{rows.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0"><div><p className="text-sm font-semibold text-slate-700">{item.leave_type} · {formatLeaveDays(item.days)}</p><p className="text-xs text-slate-400">{item.start_date} ถึง {item.end_date}</p></div><StatusBadge status={item.status} /></div>)}</ProfileList>
}

function ProfilePayroll({ payroll }) {
  return <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm md:p-7"><div className="mb-5"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Payroll</p><h2 className="mt-1 text-base font-bold text-slate-800">เงินเดือนงวดล่าสุดที่โหลดไว้</h2></div>{payroll ? <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4"><ProfileField label="รอบเงินเดือน" value={formatMonth(payroll.payroll_month)} /><ProfileField label="ค่าแรงปกติ" value={`฿${formatMoney(payroll.regular_pay)}`} /><ProfileField label="OT" value={`฿${formatMoney(payroll.overtime_pay)}`} /><ProfileField label="รับสุทธิ" value={`฿${formatMoney(payroll.net_salary)}`} /></div> : <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-400">ยังไม่มีข้อมูลเงินเดือนของงวดนี้</p>}</section>
}

function ProfileList({ title, subtitle, empty, children }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm md:p-7"><div className="mb-3"><h2 className="text-base font-bold text-slate-800">{title}</h2><p className="text-xs text-slate-400">{subtitle}</p></div>{hasChildren ? children : <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-400">{empty}</p>}</section>
}

function AttendanceTable({ rows }) {
  return <section className="space-y-5"><div><h2 className="text-lg font-bold text-slate-800">การลงเวลาทำงานวันนี้</h2><p className="text-xs text-slate-400">ข้อมูลจาก MySQL และคำนวณวันทำงานจาก Check-out</p></div><div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-slate-50 text-slate-400"><tr><th className="p-4">เวลาเข้างานครั้งแรก</th><th className="p-4">ชื่อ-นามสกุล / อีเมล</th><th className="p-4">ชั่วโมงทำงาน</th><th className="p-4">สถานะปัจจุบัน</th></tr></thead><tbody className="divide-y divide-slate-50">{rows.length === 0 ? <tr><td colSpan="4" className="p-6 text-center text-slate-400">วันนี้ยังไม่มีข้อมูลลงเวลา</td></tr> : rows.map((item) => <tr key={item.user_id}><td className="p-4 font-mono text-slate-500">{item.first_check_in ? new Date(item.first_check_in).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'}</td><td className="p-4 font-semibold">{item.full_name}<div className="text-[10px] font-normal text-slate-400">{item.email}</div></td><td className="p-4 text-slate-500">{Number(item.work_hours || 0).toFixed(2)} ชม. ({formatLeaveDays(item.work_fraction || 0)})</td><td className="p-4"><StatusBadge status={item.current_type === 'check-in' ? 'working' : 'finished'} /></td></tr>)}</tbody></table></div></section>
}

function MonthToolbar({ month, setMonth, onLoad, children }) {
  return <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><label className="text-xs font-semibold text-slate-600">เดือนที่ต้องการดู<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1 block rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs" /></label><button type="button" onClick={onLoad} className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-700">โหลดข้อมูล</button>{children}</div>
}

function OvertimePage({ employees, rows, form, setForm, onSubmit, onDelete, month, setMonth, onLoad }) {
  return <section className="space-y-5"><div><h2 className="text-lg font-bold text-slate-800">บันทึกเวลาล่วงเวลา (OT)</h2><p className="text-xs text-slate-400">รายการที่บันทึกจะถูกนำไปรวมตอนคำนวณเงินเดือน</p></div><MonthToolbar month={month} setMonth={setMonth} onLoad={onLoad} /><form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h3 className="text-sm font-bold text-slate-800">เพิ่มรายการ OT</h3><div className="grid gap-3 md:grid-cols-5"><label className="text-xs font-semibold text-slate-600 md:col-span-2">พนักงาน<select required value={form.userId} onChange={(event) => setForm((current) => ({ ...current, userId: event.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs"><option value="">เลือกพนักงาน</option>{employees.filter((item) => item.role === 'employee' && item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.full_name} ({item.employee_code || item.email})</option>)}</select></label><label className="text-xs font-semibold text-slate-600">วันที่<input required type="date" value={form.workDate} onChange={(event) => setForm((current) => ({ ...current, workDate: event.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs" /></label><label className="text-xs font-semibold text-slate-600">จำนวนชั่วโมง<input required min="0.25" max="24" step="0.25" type="number" value={form.hours} onChange={(event) => setForm((current) => ({ ...current, hours: event.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs" /></label><label className="text-xs font-semibold text-slate-600">อัตรา OT (เท่า)<input required min="1" max="3" step="0.5" type="number" value={form.rateMultiplier} onChange={(event) => setForm((current) => ({ ...current, rateMultiplier: event.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs" /></label></div><label className="block text-xs font-semibold text-slate-600">หมายเหตุ<input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="เช่น ล้างรถรอบเย็น" className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs" /></label><button type="submit" className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700">บันทึก OT</button></form><section className="overflow-x-auto rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h3 className="mb-4 text-sm font-bold text-slate-800">รายการ OT เดือน {formatMonth(month)}</h3><table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b border-slate-100 text-slate-400"><tr><th className="pb-3">วันที่</th><th className="pb-3">พนักงาน</th><th className="pb-3">ชั่วโมง</th><th className="pb-3">อัตรา</th><th className="pb-3">ประมาณการ</th><th className="pb-3">จัดการ</th></tr></thead><tbody className="divide-y divide-slate-50">{rows.length === 0 ? <tr><td colSpan="6" className="p-6 text-center text-slate-400">ยังไม่มีรายการ OT</td></tr> : rows.map((item) => <tr key={item.id}><td className="py-3">{item.work_date}</td><td className="py-3 font-medium">{item.full_name}<div className="text-[10px] text-slate-400">{item.employee_code || item.email}</div></td><td className="py-3">{Number(item.hours).toFixed(2)} ชม.</td><td className="py-3">{Number(item.rate_multiplier).toFixed(2)} เท่า</td><td className="py-3 font-semibold text-amber-600">฿{formatMoney(item.estimated_pay)}</td><td className="py-3"><button type="button" onClick={() => onDelete(item.id)} className="text-rose-600 hover:underline">ลบ</button></td></tr>)}</tbody></table></section></section>
}

function PayrollPage({ rows, month, setMonth, onLoad, onCalculate, onStatus, actionId }) {
  const calculatedRows = rows.filter((item) => item.id)
  const totalNet = calculatedRows.reduce((sum, item) => sum + Number(item.net_salary || 0), 0)
  return <section className="space-y-5"><div><h2 className="text-lg font-bold text-slate-800">เงินเดือนรายเดือน</h2><p className="text-xs text-slate-400">สูตรรายชั่วโมง: ชั่วโมงทำงาน × ค่าแรง + OT × อัตรา OT</p></div><MonthToolbar month={month} setMonth={setMonth} onLoad={onLoad}><button type="button" onClick={onCalculate} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700">คำนวณเงินเดือนเดือนนี้</button></MonthToolbar><div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><Metric label="พนักงานที่คำนวณแล้ว" value={`${calculatedRows.length}/${rows.length}`} icon="✓" color="emerald" /><Metric label="ยอดเงินเดือนรวม" value={`฿${formatMoney(totalNet)}`} icon="฿" color="blue" /><Metric label="จ่ายแล้ว" value={calculatedRows.filter((item) => item.payment_status === 'paid').length} icon="▣" color="amber" /></div><section className="overflow-x-auto rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div className="mb-4"><h3 className="text-sm font-bold text-slate-800">สรุปเงินเดือน {formatMonth(month)}</h3><p className="text-[11px] text-slate-400">กดอนุมัติ แล้วจึงกดบันทึกว่าจ่ายแล้ว</p></div><table className="w-full min-w-[1050px] text-left text-xs"><thead className="border-b border-slate-100 text-slate-400"><tr><th className="pb-3">พนักงาน</th><th className="pb-3">ค่าจ้าง</th><th className="pb-3">ทำงาน</th><th className="pb-3">ลาอนุมัติ</th><th className="pb-3">OT</th><th className="pb-3">ค่าแรงปกติ</th><th className="pb-3">OT เป็นเงิน</th><th className="pb-3">สุทธิ</th><th className="pb-3">สถานะ</th><th className="pb-3">จัดการ</th></tr></thead><tbody className="divide-y divide-slate-50">{rows.length === 0 ? <tr><td colSpan="10" className="p-6 text-center text-slate-400">ยังไม่มีพนักงาน</td></tr> : rows.map((item) => <tr key={item.user_id}><td className="py-3 font-medium">{item.full_name}<div className="text-[10px] text-slate-400">{item.employee_code || item.email}</div></td><td className="py-3">{formatMoney(item.wage_rate || item.current_wage_rate)}<div className="text-[10px] text-slate-400">{wageTypeLabels[item.wage_type || item.current_wage_type] || '-'}</div></td><td className="py-3">{item.id ? `${Number(item.regular_hours || 0).toFixed(2)} ชม.` : '-'}</td><td className="py-3">{item.id ? formatLeaveDays(item.leave_days) : '-'}</td><td className="py-3">{item.id ? `${Number(item.overtime_hours || 0).toFixed(2)} ชม.` : '-'}</td><td className="py-3">{item.id ? `฿${formatMoney(item.regular_pay)}` : '-'}</td><td className="py-3 text-amber-600">{item.id ? `฿${formatMoney(item.overtime_pay)}` : '-'}</td><td className="py-3 text-base font-bold text-blue-600">{item.id ? `฿${formatMoney(item.net_salary)}` : '-'}</td><td className="py-3">{item.id ? <StatusBadge status={item.payment_status} /> : <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] text-amber-700">ยังไม่คำนวณ</span>}</td><td className="py-3">{item.id && item.payment_status === 'draft' && <button disabled={actionId === item.id} type="button" onClick={() => onStatus(item.id, 'approved')} className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-700 disabled:opacity-50">อนุมัติ</button>}{item.id && item.payment_status === 'approved' && <button disabled={actionId === item.id} type="button" onClick={() => onStatus(item.id, 'paid')} className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[10px] font-semibold text-blue-700 disabled:opacity-50">จ่ายแล้ว</button>}</td></tr>)}</tbody></table></section></section>
}
