const express = require('express')
const { body, query, validationResult } = require('express-validator')

const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()
const STANDARD_DAILY_HOURS = Number(process.env.STANDARD_DAILY_HOURS || 8)
const STANDARD_MONTHLY_DAYS = Number(process.env.STANDARD_MONTHLY_DAYS || 22)

function validateRequest(req, res) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() })
    return true
  }
  return false
}

function monthRange(month) {
  const value = month || new Date().toISOString().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(value)) return null
  const [year, monthNumber] = value.split('-').map(Number)
  if (monthNumber < 1 || monthNumber > 12) return null
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const next = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10)
  return { month: value, start: `${value}-01`, end: `${value}-${String(lastDay).padStart(2, '0')}`, next }
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2))
}

function calculateWorkDayFraction(hours) {
  const totalHours = Math.max(0, Number(hours) || 0)
  if (totalHours >= STANDARD_DAILY_HOURS) return 1
  if (totalHours >= STANDARD_DAILY_HOURS / 2) return 0.5
  return 0
}

async function calculateForUser(connection, userId, range) {
  const [[user]] = await connection.execute("SELECT id, full_name, email, employee_code, position, wage_type, wage_rate FROM users WHERE id = ? AND role = 'employee' AND status = 'active' LIMIT 1", [userId])
  if (!user) return null

  const [[attendance]] = await connection.execute(`
    SELECT COALESCE(SUM(CASE WHEN a.type = 'check-out' AND check_in.id IS NOT NULL THEN TIMESTAMPDIFF(SECOND, check_in.timestamp, a.timestamp) ELSE 0 END), 0) AS regular_seconds
    FROM attendance a
    LEFT JOIN attendance check_in ON check_in.id = a.check_in_id
    WHERE a.user_id = ? AND a.type = 'check-out' AND a.work_date >= ? AND a.work_date < ?
  `, [userId, range.start, range.next])
  const [attendanceDays] = await connection.execute(`
    SELECT a.work_date, COALESCE(SUM(CASE WHEN check_in.id IS NOT NULL THEN TIMESTAMPDIFF(SECOND, check_in.timestamp, a.timestamp) ELSE 0 END), 0) AS total_seconds
    FROM attendance a
    LEFT JOIN attendance check_in ON check_in.id = a.check_in_id
    WHERE a.user_id = ? AND a.type = 'check-out' AND a.work_date >= ? AND a.work_date < ?
    GROUP BY a.work_date
  `, [userId, range.start, range.next])
  const [[overtime]] = await connection.execute(`
    SELECT COALESCE(SUM(hours), 0) AS overtime_hours,
      COALESCE(SUM(hours * rate_multiplier), 0) AS weighted_overtime_hours,
      COALESCE(AVG(rate_multiplier), 1.5) AS overtime_rate
    FROM overtime_records
    WHERE user_id = ? AND status = 'approved' AND work_date >= ? AND work_date < ?
  `, [userId, range.start, range.next])
  const [[leave]] = await connection.execute(`
    SELECT COALESCE(SUM(CASE
      WHEN leave_type = 'ลาครึ่งวัน' THEN 0.5
      ELSE DATEDIFF(LEAST(end_date, ?), GREATEST(start_date, ?)) + 1
    END), 0) AS leave_days
    FROM leave_requests
    WHERE user_id = ? AND status = 'approved' AND start_date < ? AND end_date >= ?
  `, [range.end, range.start, userId, range.next, range.start])

  const regularSeconds = Number(attendance.regular_seconds || 0)
  const regularHours = regularSeconds / 3600
  const regularDays = attendanceDays.reduce((total, row) => total + calculateWorkDayFraction(Number(row.total_seconds || 0) / 3600), 0)
  const overtimeHours = Number(overtime.overtime_hours || 0)
  const weightedOvertimeHours = Number(overtime.weighted_overtime_hours || 0)
  const leaveDays = Number(leave.leave_days || 0)
  const wageRate = Number(user.wage_rate || 0)
  const testMode = process.env.ATTENDANCE_TEST_MODE === 'true' && user.wage_type === 'hourly'
  const testMinuteWage = Number(process.env.TEST_MINUTE_WAGE || 50)
  const hourlyEquivalent = user.wage_type === 'hourly'
    ? wageRate
    : user.wage_type === 'daily'
      ? wageRate / STANDARD_DAILY_HOURS
      : wageRate / (STANDARD_MONTHLY_DAYS * STANDARD_DAILY_HOURS)
  const regularPay = user.wage_type === 'hourly'
    ? testMode ? Math.round(regularHours * 60) * testMinuteWage : regularHours * wageRate
    : user.wage_type === 'daily'
      ? regularDays * wageRate
      : wageRate
  const overtimePay = weightedOvertimeHours * hourlyEquivalent
  const grossSalary = regularPay + overtimePay

  return {
    user,
    wage_type: user.wage_type,
    wage_rate: roundMoney(wageRate),
    regular_hours: roundMoney(regularHours),
    regular_days: roundMoney(regularDays),
    leave_days: roundMoney(leaveDays),
    overtime_hours: roundMoney(overtimeHours),
    overtime_rate: roundMoney(Number(overtime.overtime_rate || 1.5)),
    regular_pay: roundMoney(regularPay),
    overtime_pay: roundMoney(overtimePay),
    gross_salary: roundMoney(grossSalary),
    deductions: 0,
    net_salary: roundMoney(grossSalary),
    test_mode: testMode,
    test_minute_wage: testMinuteWage,
  }
}

const monthValidator = query('month').optional().matches(/^\d{4}-\d{2}$/).withMessage('รูปแบบเดือนต้องเป็น YYYY-MM')

router.get('/me', monthValidator, requireAuth, async (req, res, next) => {
  const range = monthRange(req.query.month)
  if (!range) return res.status(400).json({ message: 'เดือนไม่ถูกต้อง' })
  try {
    const [rows] = await db.execute(`
      SELECT id, DATE_FORMAT(payroll_month, '%Y-%m') AS payroll_month, wage_type, wage_rate, regular_hours, regular_days,
        leave_days, overtime_hours, overtime_rate, regular_pay, overtime_pay,
        gross_salary, deductions, net_salary, payment_status, paid_at,
        approved_at, calculated_at, notes
      FROM payrolls WHERE user_id = ? ORDER BY payroll_month DESC, id DESC
    `, [req.auth.sub])
    const storedCurrent = rows.find((row) => String(row.payroll_month).slice(0, 7) === range.month) || null
    const latest = await calculateForUser(db, req.auth.sub, range)
    let current = storedCurrent
    if (latest) {
      current = {
        ...(storedCurrent || {
          id: null,
          payroll_month: range.month,
          payment_status: 'draft',
          paid_at: null,
          approved_at: null,
          calculated_at: null,
          notes: null,
        }),
          wage_type: latest.wage_type,
          wage_rate: latest.wage_rate,
          regular_hours: latest.regular_hours,
          regular_days: latest.regular_days,
          leave_days: latest.leave_days,
          overtime_hours: latest.overtime_hours,
          overtime_rate: latest.overtime_rate,
          regular_pay: latest.regular_pay,
          overtime_pay: latest.overtime_pay,
          gross_salary: latest.gross_salary,
          deductions: storedCurrent?.deductions || 0,
          net_salary: roundMoney(latest.gross_salary - Number(storedCurrent?.deductions || 0)),
          test_mode: latest.test_mode,
          test_minute_wage: latest.test_minute_wage,
          is_live: true,
      }
    }
    const responseRows = current?.is_live
      ? current.id === null ? [current, ...rows] : rows.map((row) => row.id === current.id ? current : row)
      : rows
    return res.json({ month: range.month, current, rows: responseRows })
  } catch (error) {
    return next(error)
  }
})

router.get('/admin', monthValidator, requireAuth, requireRole('admin'), async (req, res, next) => {
  const range = monthRange(req.query.month)
  if (!range) return res.status(400).json({ message: 'เดือนไม่ถูกต้อง' })
  try {
    const [rows] = await db.execute(`
      SELECT u.id AS user_id, u.full_name, u.email, u.employee_code, u.position,
        u.wage_type AS current_wage_type, u.wage_rate AS current_wage_rate,
        p.id, DATE_FORMAT(p.payroll_month, '%Y-%m') AS payroll_month, p.wage_type, p.wage_rate, p.regular_hours,
        p.regular_days, p.leave_days, p.overtime_hours, p.overtime_rate,
        p.regular_pay, p.overtime_pay, p.gross_salary, p.deductions,
        p.net_salary, p.payment_status, p.paid_at, p.approved_at, p.calculated_at
      FROM users u
      LEFT JOIN payrolls p ON p.user_id = u.id AND p.payroll_month = ?
      WHERE u.role = 'employee' AND u.status = 'active'
      ORDER BY u.id ASC
    `, [range.start])
    return res.json({ month: range.month, rows })
  } catch (error) {
    return next(error)
  }
})

router.post('/calculate', [
  body('month').matches(/^\d{4}-\d{2}$/).withMessage('รูปแบบเดือนต้องเป็น YYYY-MM'),
], requireAuth, requireRole('admin'), async (req, res, next) => {
  if (validateRequest(req, res)) return
  const range = monthRange(req.body.month)
  if (!range) return res.status(400).json({ message: 'เดือนไม่ถูกต้อง' })

  let connection
  try {
    connection = await db.getConnection()
    await connection.beginTransaction()
    const [users] = await connection.execute("SELECT id FROM users WHERE role = 'employee' AND status = 'active' ORDER BY id ASC")
    const selectedUsers = req.body.userId ? users.filter((item) => Number(item.id) === Number(req.body.userId)) : users
    if (selectedUsers.length === 0) {
      await connection.rollback()
      return res.status(404).json({ message: 'ไม่พบพนักงานที่ต้องคำนวณ' })
    }

    let calculated = 0
    for (const user of selectedUsers) {
      const details = await calculateForUser(connection, user.id, range)
      if (!details) continue
      await connection.execute(`
        INSERT INTO payrolls (
          user_id, payroll_month, wage_type, wage_rate, regular_hours, regular_days,
          leave_days, overtime_hours, overtime_rate, regular_pay, overtime_pay,
          gross_salary, deductions, net_salary, payment_status, calculated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NOW())
        ON DUPLICATE KEY UPDATE
          wage_type = VALUES(wage_type), wage_rate = VALUES(wage_rate),
          regular_hours = VALUES(regular_hours), regular_days = VALUES(regular_days),
          leave_days = VALUES(leave_days), overtime_hours = VALUES(overtime_hours),
          overtime_rate = VALUES(overtime_rate), regular_pay = VALUES(regular_pay),
          overtime_pay = VALUES(overtime_pay), gross_salary = VALUES(gross_salary),
          deductions = VALUES(deductions), net_salary = VALUES(net_salary),
          payment_status = 'draft', approved_by = NULL, approved_at = NULL,
          paid_at = NULL, calculated_at = NOW()
      `, [user.id, range.start, details.wage_type, details.wage_rate, details.regular_hours, details.regular_days, details.leave_days, details.overtime_hours, details.overtime_rate, details.regular_pay, details.overtime_pay, details.gross_salary, details.deductions, details.net_salary])
      calculated += 1
    }
    await connection.commit()
    return res.json({ message: `คำนวณเงินเดือนเดือน ${range.month} สำเร็จ ${calculated} คน`, calculated })
  } catch (error) {
    if (connection) await connection.rollback()
    return next(error)
  } finally {
    connection?.release()
  }
})

router.patch('/:id/status', [
  body('status').isIn(['draft', 'approved', 'paid']).withMessage('สถานะเงินเดือนไม่ถูกต้อง'),
], requireAuth, requireRole('admin'), async (req, res, next) => {
  if (validateRequest(req, res)) return
  try {
    const [[payroll]] = await db.execute('SELECT id, payment_status FROM payrolls WHERE id = ? LIMIT 1', [req.params.id])
    if (!payroll) return res.status(404).json({ message: 'ไม่พบรายการเงินเดือน' })
    if (req.body.status === 'paid' && payroll.payment_status !== 'approved') {
      return res.status(409).json({ message: 'ต้องอนุมัติเงินเดือนก่อนบันทึกว่าจ่ายแล้ว' })
    }

    if (req.body.status === 'approved') {
      await db.execute('UPDATE payrolls SET payment_status = \'approved\', approved_by = ?, approved_at = NOW(), paid_at = NULL WHERE id = ?', [req.auth.sub, req.params.id])
    } else if (req.body.status === 'paid') {
      await db.execute('UPDATE payrolls SET payment_status = \'paid\', paid_at = NOW() WHERE id = ?', [req.params.id])
    } else {
      await db.execute('UPDATE payrolls SET payment_status = \'draft\', approved_by = NULL, approved_at = NULL, paid_at = NULL WHERE id = ?', [req.params.id])
    }
    return res.json({ message: 'อัปเดตสถานะเงินเดือนสำเร็จ' })
  } catch (error) {
    return next(error)
  }
})

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db.execute(`
      SELECT p.*, u.full_name, u.email, u.employee_code, u.position
      FROM payrolls p INNER JOIN users u ON u.id = p.user_id
      WHERE p.id = ? AND (p.user_id = ? OR ? = 'admin') LIMIT 1
    `, [req.params.id, req.auth.sub, req.auth.role])
    if (rows.length === 0) return res.status(404).json({ message: 'ไม่พบสลิปเงินเดือน' })
    return res.json({ row: rows[0] })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
