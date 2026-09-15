import { useMemo, useState } from 'react'
import StatusBadge from './StatusBadge'
import { formatDate, formatLeaveDays, formatMoney, formatMonth, getDateInputValue } from '../utils/format'

function formatHours(value) {
  const number = Number(value || 0)
  return Number.isInteger(number) ? String(number) : number.toFixed(2)
}

export default function SalarySlip({ currentPayroll, payrolls, overtime, hourlyWage, testMinuteWage, user }) {
  const [selectedId, setSelectedId] = useState(null)
  const recentPayrolls = useMemo(() => {
    const currentMonth = getDateInputValue().slice(0, 7)
    const [currentYear, currentMonthNumber] = currentMonth.split('-').map(Number)
    const currentIndex = currentYear * 12 + currentMonthNumber - 1

    return payrolls.filter((item) => {
      const [year, month] = String(item.payroll_month || '').slice(0, 7).split('-').map(Number)
      if (!year || !month) return false
      const monthIndex = year * 12 + month - 1
      return monthIndex <= currentIndex && monthIndex >= currentIndex - 5
    }).slice(0, 6)
  }, [payrolls])

  const selectedStoredPayroll = recentPayrolls.find((item) => item.id === selectedId)
  const selectedPayroll = selectedStoredPayroll?.id === currentPayroll?.id
    ? currentPayroll
    : selectedStoredPayroll || currentPayroll || recentPayrolls[0] || null
  const selectedWage = Number(selectedPayroll?.wage_rate || hourlyWage || 0)
  const selectedTestMode = selectedPayroll?.test_mode === true
  const selectedTestMinuteWage = Number(selectedPayroll?.test_minute_wage || testMinuteWage || 50)
  const selectedTestMinutes = Math.round(Number(selectedPayroll?.regular_hours || 0) * 60)
  const wageDescription = selectedTestMode ? `โหมดทดสอบ ${formatMoney(selectedTestMinuteWage)} บาท/นาที` : `${formatMoney(selectedWage)} บาท/ชม.`

  return <section className="salary-page space-y-4">
    <div className="no-print">
      <p className="text-xs text-slate-400">รายได้ประจำเดือน</p>
      <h2 className="text-lg font-bold text-slate-800">สลิปเงินเดือนของฉัน</h2>
      <p className="text-xs text-slate-500">ดูรายละเอียดรายได้และพิมพ์สลิปย้อนหลังได้</p>
    </div>

    {selectedPayroll ? <article className="salary-paper overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="salary-paper-header p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] text-white/70">สลิปเงินเดือน</p>
            <h3 className="mt-1 text-lg font-bold">{formatMonth(selectedPayroll.payroll_month)}</h3>
            <p className="mt-2 text-xs text-white/80">{user?.full_name || '-'} · {user?.employee_code || '-'}</p>
          </div>
          <div className="text-right">
            <StatusBadge status={selectedPayroll.payment_status} />
            <p className="mt-3 text-[10px] text-white/70">รับสุทธิ</p>
            <p className="text-2xl font-bold">฿{formatMoney(selectedPayroll.net_salary)}</p>
            {selectedPayroll.is_live && <p className="mt-1 text-[9px] text-white/70">อัปเดตจากข้อมูลล่าสุด</p>}
          </div>
        </div>
      </header>

      <div className="p-4">
        <div className="salary-summary">
          <div><span>ทำงาน</span><strong>{formatHours(selectedPayroll.regular_hours)} ชม.</strong></div>
          <div><span>OT</span><strong>{formatHours(selectedPayroll.overtime_hours)} ชม.</strong></div>
          <div><span>วันลา</span><strong>{formatLeaveDays(selectedPayroll.leave_days)}</strong></div>
        </div>

        <SalarySlipHeading label="รายการรายได้" />
        <SalarySlipRow label="ค่าแรงปกติ" detail={selectedTestMode ? `${formatHours(selectedPayroll.regular_hours)} ชั่วโมง · คิดทดสอบ ${selectedTestMinutes} นาที × ฿${formatMoney(selectedTestMinuteWage)}` : `${formatHours(selectedPayroll.regular_hours)} ชั่วโมง × ฿${formatMoney(selectedWage)}`} value={selectedPayroll.regular_pay} />
        <SalarySlipRow label="ค่าล่วงเวลา (OT)" detail={`${formatHours(selectedPayroll.overtime_hours)} ชั่วโมง × ${Number(selectedPayroll.overtime_rate || 1.5).toFixed(2)} เท่า`} value={selectedPayroll.overtime_pay} />
        <SalarySlipRow label="รวมรายได้" value={selectedPayroll.gross_salary} strong />

        <SalarySlipHeading label="รายการหัก" />
        <SalarySlipRow label="รายการหักอื่น ๆ" detail={Number(selectedPayroll.deductions || 0) ? 'หักตามข้อมูลที่ผู้ดูแลบันทึก' : 'ยังไม่มีรายการหัก'} value={selectedPayroll.deductions} negative />

        <div className="salary-total">
          <div><span>เงินเดือนรับสุทธิ</span><small>ยอดที่ได้รับในรอบนี้</small></div>
          <strong>฿{formatMoney(selectedPayroll.net_salary)}</strong>
        </div>

        <button type="button" onClick={() => window.print()} className="no-print mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white hover:bg-slate-700">พิมพ์ / บันทึกเป็น PDF</button>
      </div>
    </article> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">ยังไม่มีสลิปเงินเดือนของเดือนนี้</div>}

    <div className="no-print grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-xs text-slate-400">อัตราค่าจ้าง</p><p className="mt-1 text-xl font-bold text-slate-800">{wageDescription}</p></div>
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-xs text-slate-400">OT เดือนที่เลือก</p><p className="mt-1 text-xl font-bold text-amber-600">{formatHours(selectedPayroll?.overtime_hours)} ชม.</p></div>
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm"><p className="text-xs text-emerald-600">รับสุทธิเดือนที่เลือก</p><p className="mt-1 text-xl font-bold text-emerald-700">{formatMoney(selectedPayroll?.net_salary)} บาท</p></div>
    </div>

    <section className="no-print space-y-3">
      <h3 className="text-sm font-bold text-slate-700">รายการ OT เดือนนี้</h3>
      {overtime.rows.length === 0 ? <p className="rounded-2xl bg-white p-5 text-center text-xs text-slate-400">ยังไม่มีรายการ OT</p> : <div className="space-y-2">{overtime.rows.map((item) => <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm"><div><p className="text-xs font-bold text-slate-800">{formatDate(item.work_date)} · {Number(item.hours).toFixed(2)} ชั่วโมง</p><p className="text-[10px] text-slate-400">อัตรา {Number(item.rate_multiplier).toFixed(2)} เท่า {item.note ? `· ${item.note}` : ''}</p></div><strong className="text-sm text-amber-600">฿{formatMoney(item.estimated_pay)}</strong></div>)}</div>}
    </section>

    <section className="no-print space-y-3">
      <div><h3 className="text-sm font-bold text-slate-700">ประวัติสลิปเงินเดือน 6 เดือนล่าสุด</h3><p className="text-[10px] text-slate-400">กดเลือกเดือนเพื่อดูรายละเอียดสลีป</p></div>
      {recentPayrolls.length === 0 ? <p className="rounded-2xl bg-white p-5 text-center text-xs text-slate-400">ยังไม่มีประวัติเงินเดือนในช่วง 6 เดือนล่าสุด</p> : <div className="grid gap-2 sm:grid-cols-2">{recentPayrolls.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`flex items-center justify-between rounded-2xl border p-3.5 text-left shadow-sm transition ${selectedPayroll?.id === item.id ? 'border-blue-300 bg-blue-50' : 'border-slate-100 bg-white hover:border-blue-200 hover:bg-slate-50'}`}><div><p className="text-xs font-bold text-slate-800">{formatMonth(item.payroll_month)}</p><p className="text-[10px] text-slate-400">ทำงาน {formatHours(item.regular_hours)} ชม. · OT {formatHours(item.overtime_hours)} ชม.</p></div><div className="text-right"><StatusBadge status={item.payment_status} /><p className="mt-1 text-sm font-bold text-slate-800">฿{formatMoney(item.net_salary)}</p></div></button>)}</div>}
    </section>
  </section>
}

function SalarySlipHeading({ label }) {
  return <div className="salary-slip-heading">{label}</div>
}

function SalarySlipRow({ label, detail, value, strong = false, negative = false }) {
  const amount = Number(value || 0)
  return <div className={`salary-slip-row ${strong ? 'font-semibold' : ''}`}>
    <div><p>{label}</p>{detail && <small>{detail}</small>}</div>
    <span className={negative && amount > 0 ? 'text-rose-600' : ''}>{negative && amount > 0 ? '-' : ''}฿{formatMoney(amount)}</span>
  </div>
}
