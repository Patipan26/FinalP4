import StatusBadge from './StatusBadge'
import { formatLeaveDays, formatMoney, formatMonth } from '../utils/format'

function formatHours(value) {
  const number = Number(value || 0)
  return Number.isInteger(number) ? String(number) : number.toFixed(2)
}

export default function SalarySlip({ currentPayroll, payrolls, overtime, hourlyWage, estimatedWage, totalOvertimeHours, totalOvertimePay, user }) {
  return <section className="salary-page space-y-4">
    <div className="no-print">
      <p className="text-xs text-slate-400">รายได้ประจำเดือน</p>
      <h2 className="text-lg font-bold text-slate-800">สลิปเงินเดือนของฉัน</h2>
      <p className="text-xs text-slate-500">ดูรายละเอียดรายได้และพิมพ์สลิปย้อนหลังได้</p>
    </div>

    {currentPayroll ? <article className="salary-paper overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="salary-paper-header p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] text-white/70">สลิปเงินเดือน</p>
            <h3 className="mt-1 text-lg font-bold">{formatMonth(currentPayroll.payroll_month)}</h3>
            <p className="mt-2 text-xs text-white/80">{user?.full_name || '-'} · {user?.employee_code || '-'}</p>
          </div>
          <div className="text-right">
            <StatusBadge status={currentPayroll.payment_status} />
            <p className="mt-3 text-[10px] text-white/70">รับสุทธิ</p>
            <p className="text-2xl font-bold">฿{formatMoney(currentPayroll.net_salary)}</p>
            {currentPayroll.is_live && <p className="mt-1 text-[9px] text-white/70">อัปเดตจากข้อมูลล่าสุด</p>}
          </div>
        </div>
      </header>

      <div className="p-4">
        <div className="salary-summary">
          <div><span>ทำงาน</span><strong>{formatHours(currentPayroll.regular_hours)} ชม.</strong></div>
          <div><span>OT</span><strong>{formatHours(currentPayroll.overtime_hours)} ชม.</strong></div>
          <div><span>วันลา</span><strong>{formatLeaveDays(currentPayroll.leave_days)}</strong></div>
        </div>

        <SalarySlipHeading label="รายการรายได้" />
        <SalarySlipRow label="ค่าแรงปกติ" detail={`${formatHours(currentPayroll.regular_hours)} ชั่วโมง × ฿${formatMoney(hourlyWage)}`} value={currentPayroll.regular_pay} />
        <SalarySlipRow label="ค่าล่วงเวลา (OT)" detail={`${formatHours(currentPayroll.overtime_hours)} ชั่วโมง × ${Number(currentPayroll.overtime_rate || 1.5).toFixed(2)} เท่า`} value={currentPayroll.overtime_pay} />
        <SalarySlipRow label="รวมรายได้" value={currentPayroll.gross_salary} strong />

        <SalarySlipHeading label="รายการหัก" />
        <SalarySlipRow label="รายการหักอื่น ๆ" detail={Number(currentPayroll.deductions || 0) ? 'หักตามข้อมูลที่ผู้ดูแลบันทึก' : 'ยังไม่มีรายการหัก'} value={currentPayroll.deductions} negative />

        <div className="salary-total">
          <div><span>เงินเดือนรับสุทธิ</span><small>ยอดที่ได้รับในรอบนี้</small></div>
          <strong>฿{formatMoney(currentPayroll.net_salary)}</strong>
        </div>

        <button type="button" onClick={() => window.print()} className="no-print mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white hover:bg-slate-700">พิมพ์สลิปเงินเดือน</button>
      </div>
    </article> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">ยังไม่มีสลิปเงินเดือนของเดือนนี้</div>}

    <div className="no-print grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-xs text-slate-400">ค่าแรงพื้นฐาน</p><p className="mt-1 text-xl font-bold text-slate-800">{formatMoney(hourlyWage)} บาท/ชม.</p></div>
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-xs text-slate-400">OT เดือนนี้</p><p className="mt-1 text-xl font-bold text-amber-600">{totalOvertimeHours.toFixed(2)} ชม.</p></div>
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm"><p className="text-xs text-emerald-600">รายได้ประมาณการ</p><p className="mt-1 text-xl font-bold text-emerald-700">{formatMoney(estimatedWage + totalOvertimePay)} บาท</p></div>
    </div>

    <section className="no-print space-y-3">
      <h3 className="text-sm font-bold text-slate-700">รายการ OT เดือนนี้</h3>
      {overtime.rows.length === 0 ? <p className="rounded-2xl bg-white p-5 text-center text-xs text-slate-400">ยังไม่มีรายการ OT</p> : <div className="space-y-2">{overtime.rows.map((item) => <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm"><div><p className="text-xs font-bold text-slate-800">{item.work_date} · {Number(item.hours).toFixed(2)} ชั่วโมง</p><p className="text-[10px] text-slate-400">อัตรา {Number(item.rate_multiplier).toFixed(2)} เท่า {item.note ? `· ${item.note}` : ''}</p></div><strong className="text-sm text-amber-600">฿{formatMoney(item.estimated_pay)}</strong></div>)}</div>}
    </section>

    <section className="no-print space-y-3">
      <h3 className="text-sm font-bold text-slate-700">ประวัติสลิปเงินเดือน</h3>
      {payrolls.length === 0 ? <p className="rounded-2xl bg-white p-5 text-center text-xs text-slate-400">ยังไม่มีประวัติเงินเดือน</p> : <div className="space-y-2">{payrolls.map((item) => <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm"><div><p className="text-xs font-bold text-slate-800">{formatMonth(item.payroll_month)}</p><p className="text-[10px] text-slate-400">ทำงาน {formatHours(item.regular_hours)} ชม. · OT {formatHours(item.overtime_hours)} ชม.</p></div><div className="text-right"><StatusBadge status={item.payment_status} /><p className="mt-1 text-sm font-bold text-slate-800">฿{formatMoney(item.net_salary)}</p></div></div>)}</div>}
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
