const express = require('express')
const { body, query, validationResult } = require('express-validator')

const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()

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
  const next = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10)
  return { month: value, start: `${value}-01`, next }
}

const monthValidator = query('month').optional().matches(/^\d{4}-\d{2}$/).withMessage('รูปแบบเดือนต้องเป็น YYYY-MM')

router.get('/me', monthValidator, requireAuth, async (req, res, next) => {
  const range = monthRange(req.query.month)
  if (!range) return res.status(400).json({ message: 'เดือนไม่ถูกต้อง' })

  try {
    const [rows] = await db.execute(`
      SELECT o.id, DATE_FORMAT(o.work_date, '%Y-%m-%d') AS work_date, o.hours, o.rate_multiplier, o.note, o.status,
        u.wage_type, u.wage_rate,
        o.hours * o.rate_multiplier * CASE
          WHEN u.wage_type = 'hourly' THEN u.wage_rate
          WHEN u.wage_type = 'daily' THEN u.wage_rate / 8
          ELSE u.wage_rate / (22 * 8)
        END AS estimated_pay
      FROM overtime_records o
      INNER JOIN users u ON u.id = o.user_id
      WHERE o.user_id = ? AND o.work_date >= ? AND o.work_date < ?
      ORDER BY o.work_date DESC, o.id DESC
    `, [req.auth.sub, range.start, range.next])
    const [summaryRows] = await db.execute(`
      SELECT COALESCE(SUM(hours), 0) AS total_hours,
        COALESCE(SUM(hours * rate_multiplier), 0) AS weighted_hours
      FROM overtime_records
      WHERE user_id = ? AND status = 'approved' AND work_date >= ? AND work_date < ?
    `, [req.auth.sub, range.start, range.next])
    return res.json({ month: range.month, rows, summary: summaryRows[0] })
  } catch (error) {
    return next(error)
  }
})

router.get('/admin', [monthValidator], requireAuth, requireRole('admin'), async (req, res, next) => {
  const range = monthRange(req.query.month)
  if (!range) return res.status(400).json({ message: 'เดือนไม่ถูกต้อง' })

  try {
    const [rows] = await db.execute(`
      SELECT o.id, o.user_id, DATE_FORMAT(o.work_date, '%Y-%m-%d') AS work_date, o.hours, o.rate_multiplier, o.note, o.status,
        u.full_name, u.email, u.employee_code, u.wage_type, u.wage_rate,
        o.hours * o.rate_multiplier * CASE
          WHEN u.wage_type = 'hourly' THEN u.wage_rate
          WHEN u.wage_type = 'daily' THEN u.wage_rate / 8
          ELSE u.wage_rate / (22 * 8)
        END AS estimated_pay
      FROM overtime_records o
      INNER JOIN users u ON u.id = o.user_id
      WHERE o.work_date >= ? AND o.work_date < ?
      ORDER BY o.work_date DESC, o.id DESC
    `, [range.start, range.next])
    return res.json({ month: range.month, rows })
  } catch (error) {
    return next(error)
  }
})

router.post('/', [
  body('userId').isInt({ min: 1 }).withMessage('ต้องเลือกพนักงาน'),
  body('workDate').isISO8601().withMessage('วันที่ OT ไม่ถูกต้อง'),
  body('hours').isFloat({ min: 0.25, max: 24 }).withMessage('ชั่วโมง OT ต้องอยู่ระหว่าง 0.25 ถึง 24 ชั่วโมง'),
  body('rateMultiplier').optional().isFloat({ min: 1, max: 3 }).withMessage('อัตรา OT ต้องอยู่ระหว่าง 1 ถึง 3 เท่า'),
  body('note').optional().trim().isLength({ max: 500 }).withMessage('หมายเหตุยาวเกินไป'),
], requireAuth, requireRole('admin'), async (req, res, next) => {
  if (validateRequest(req, res)) return

  try {
    const [users] = await db.execute("SELECT id FROM users WHERE id = ? AND role = 'employee' AND status = 'active' LIMIT 1", [req.body.userId])
    if (users.length === 0) return res.status(404).json({ message: 'ไม่พบพนักงานที่ใช้งานอยู่' })

    const [result] = await db.execute(
      'INSERT INTO overtime_records (user_id, work_date, hours, rate_multiplier, note, status, recorded_by) VALUES (?, ?, ?, ?, ?, \'approved\', ?)',
      [req.body.userId, req.body.workDate, Number(req.body.hours), Number(req.body.rateMultiplier || 1.5), req.body.note?.trim() || null, req.auth.sub],
    )
    return res.status(201).json({ message: 'บันทึก OT สำเร็จ', overtimeId: result.insertId })
  } catch (error) {
    return next(error)
  }
})

router.patch('/:id/status', [
  body('status').isIn(['approved', 'rejected']).withMessage('สถานะ OT ไม่ถูกต้อง'),
], requireAuth, requireRole('admin'), async (req, res, next) => {
  if (validateRequest(req, res)) return
  try {
    const [result] = await db.execute('UPDATE overtime_records SET status = ? WHERE id = ?', [req.body.status, req.params.id])
    if (result.affectedRows === 0) return res.status(404).json({ message: 'ไม่พบรายการ OT' })
    return res.json({ message: 'อัปเดตสถานะ OT สำเร็จ' })
  } catch (error) {
    return next(error)
  }
})

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const [result] = await db.execute('DELETE FROM overtime_records WHERE id = ?', [req.params.id])
    if (result.affectedRows === 0) return res.status(404).json({ message: 'ไม่พบรายการ OT' })
    return res.json({ message: 'ลบรายการ OT สำเร็จ' })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
