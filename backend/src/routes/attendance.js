const express = require('express')
const { body, query, validationResult } = require('express-validator')

const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { calculateDistance, getShopLocation, validateCoordinates } = require('../utils/geo')

const router = express.Router()

function validateRequest(req, res) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() })
    return true
  }
  return false
}

function getLocationFromBody(req, res) {
  const { latitude, longitude } = req.body
  if (!validateCoordinates(latitude, longitude)) {
    res.status(400).json({ message: 'พิกัด GPS ไม่ถูกต้อง' })
    return null
  }

  const shop = getShopLocation()
  const distance = calculateDistance(Number(latitude), Number(longitude), shop.latitude, shop.longitude)
  if (distance > shop.maxDistance) {
    res.status(403).json({ message: `อยู่นอกพื้นที่ร้าน ห่างจากร้านประมาณ ${Math.round(distance)} เมตร` })
    return null
  }

  return { latitude: Number(latitude), longitude: Number(longitude), distance: Number(distance.toFixed(2)) }
}

function calculateWorkSummary(checkInTime, checkOutTime) {
  const hours = Math.max(0, (new Date(checkOutTime) - new Date(checkInTime)) / 3600000)
  const standardDailyHours = Number(process.env.STANDARD_DAILY_HOURS || 8)
  const fraction = Math.max(0.5, Math.min(1, Math.round((hours / standardDailyHours) * 2) / 2))
  return {
    hours: Number(hours.toFixed(2)),
    fraction,
    status: fraction === 0.5 ? 'half-day' : 'full-day',
  }
}

router.post('/check-in', [
  body('latitude').exists().withMessage('ต้องส่ง latitude'),
  body('longitude').exists().withMessage('ต้องส่ง longitude'),
], requireAuth, async (req, res, next) => {
  if (validateRequest(req, res)) return
  const location = getLocationFromBody(req, res)
  if (!location) return

  try {
    const [latestRows] = await db.execute('SELECT type FROM attendance WHERE user_id = ? AND DATE(`timestamp`) = CURDATE() ORDER BY `timestamp` DESC, id DESC LIMIT 1', [req.auth.sub])
    if (latestRows[0]?.type === 'check-in') {
      return res.status(409).json({ message: 'วันนี้คุณลงเวลาเข้างานไปแล้ว' })
    }

    const [result] = await db.execute(
      'INSERT INTO attendance (user_id, type, timestamp, work_date, latitude, longitude, distance_meters) VALUES (?, \'check-in\', NOW(), CURDATE(), ?, ?, ?)',
      [req.auth.sub, location.latitude, location.longitude, location.distance],
    )
    return res.status(201).json({ message: 'ลงเวลาเข้างานสำเร็จ', attendanceId: result.insertId, distance: location.distance })
  } catch (error) {
    return next(error)
  }
})

router.post('/check-out', [
  body('latitude').exists().withMessage('ต้องส่ง latitude'),
  body('longitude').exists().withMessage('ต้องส่ง longitude'),
], requireAuth, async (req, res, next) => {
  if (validateRequest(req, res)) return
  const location = getLocationFromBody(req, res)
  if (!location) return

  try {
    const [latestRows] = await db.execute('SELECT id, type, `timestamp` FROM attendance WHERE user_id = ? AND DATE(`timestamp`) = CURDATE() ORDER BY `timestamp` DESC, id DESC LIMIT 1', [req.auth.sub])
    const latest = latestRows[0]
    if (!latest || latest.type !== 'check-in') {
      return res.status(409).json({ message: 'ยังไม่มีรายการเข้างานที่เปิดอยู่สำหรับวันนี้' })
    }

    const checkOutTime = new Date()
    const work = calculateWorkSummary(latest.timestamp, checkOutTime)
    const [result] = await db.execute(
      'INSERT INTO attendance (user_id, type, timestamp, work_date, latitude, longitude, distance_meters, check_in_id, work_hours, work_fraction, work_status) VALUES (?, \'check-out\', ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?)',
      [req.auth.sub, checkOutTime, location.latitude, location.longitude, location.distance, latest.id, work.hours, work.fraction, work.status],
    )

    return res.status(201).json({ message: 'ลงเวลาออกงานสำเร็จ', attendanceId: result.insertId, workHours: work.hours, workFraction: work.fraction, workStatus: work.status })
  } catch (error) {
    return next(error)
  }
})

router.get('/me', [
  query('month').optional().matches(/^\d{4}-\d{2}$/).withMessage('รูปแบบเดือนต้องเป็น YYYY-MM'),
], requireAuth, async (req, res, next) => {
  if (validateRequest(req, res)) return

  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7)
    const [logs] = await db.execute('SELECT id, type, `timestamp`, latitude, longitude, distance_meters, work_hours, work_fraction, work_status FROM attendance WHERE user_id = ? AND DATE_FORMAT(`timestamp`, \'%Y-%m\') = ? ORDER BY `timestamp` DESC, id DESC', [req.auth.sub, month])
    const [summaryRows] = await db.execute('SELECT COALESCE(SUM(CASE WHEN a.type = \'check-out\' THEN a.work_hours ELSE 0 END), 0) AS total_hours, COALESCE(SUM(CASE WHEN a.type = \'check-out\' THEN a.work_fraction ELSE 0 END), 0) AS total_work_days, u.wage_type, u.wage_rate FROM users u LEFT JOIN attendance a ON a.user_id = u.id AND DATE_FORMAT(a.`timestamp`, \'%Y-%m\') = ? WHERE u.id = ? GROUP BY u.wage_type, u.wage_rate', [month, req.auth.sub])
    const [todayRows] = await db.execute('SELECT type, `timestamp`, work_hours, work_fraction, work_status FROM attendance WHERE user_id = ? AND DATE(`timestamp`) = CURDATE() ORDER BY `timestamp` DESC, id DESC LIMIT 1', [req.auth.sub])
    const summary = summaryRows[0] || { total_hours: 0, total_work_days: 0, wage_type: 'hourly', wage_rate: process.env.HOURLY_WAGE || 50 }
    const wageType = summary.wage_type || 'hourly'
    const wageRate = Number(summary.wage_rate || process.env.HOURLY_WAGE || 50)
    const effectiveHourlyWage = wageType === 'hourly' ? wageRate : wageType === 'daily' ? wageRate / Number(process.env.STANDARD_DAILY_HOURS || 8) : wageRate / (Number(process.env.STANDARD_MONTHLY_DAYS || 22) * Number(process.env.STANDARD_DAILY_HOURS || 8))
    summary.wage_type = wageType
    summary.wage_rate = wageRate
    summary.hourly_wage = Number(effectiveHourlyWage.toFixed(2))
    summary.estimated_wage = Number((Number(summary.total_hours) * effectiveHourlyWage).toFixed(2))

    return res.json({ month, logs, summary, today: todayRows[0] || null })
  } catch (error) {
    return next(error)
  }
})

router.get('/today', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        a.user_id,
        u.full_name,
        u.email,
        u.employee_code,
        MIN(CASE WHEN a.type = 'check-in' THEN a.timestamp END) AS first_check_in,
        MAX(a.timestamp) AS latest_timestamp,
        SUBSTRING_INDEX(GROUP_CONCAT(a.type ORDER BY a.timestamp DESC, a.id DESC), ',', 1) AS current_type,
        COALESCE(SUM(CASE WHEN a.type = 'check-out' THEN a.work_hours ELSE 0 END), 0) AS work_hours,
        COALESCE(SUM(CASE WHEN a.type = 'check-out' THEN a.work_fraction ELSE 0 END), 0) AS work_fraction,
        COALESCE(SUM(CASE WHEN a.type = 'check-out' THEN a.work_hours ELSE 0 END), 0) * ? AS estimated_wage
      FROM attendance a
      INNER JOIN users u ON u.id = a.user_id
      WHERE DATE(a.timestamp) = CURDATE()
      GROUP BY a.user_id, u.full_name, u.email, u.employee_code
      ORDER BY first_check_in ASC
    `, [Number(process.env.HOURLY_WAGE || 50)])
    return res.json({ date: new Date().toISOString().slice(0, 10), rows })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
