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
  const testMode = process.env.ATTENDANCE_TEST_MODE === 'true'
  if (!testMode && distance > shop.maxDistance) {
    res.status(403).json({ message: `อยู่นอกพื้นที่ร้าน ห่างจากร้านประมาณ ${Math.round(distance)} เมตร` })
    return null
  }

  return { latitude: Number(latitude), longitude: Number(longitude), distance: Number(distance.toFixed(2)) }
}

const WORK_START_TIME = process.env.WORK_START_TIME || '09:00'
const WORK_END_TIME = process.env.WORK_END_TIME || '18:00'
const WORK_GRACE_MINUTES = Number(process.env.WORK_GRACE_MINUTES || 0)

function timeToMinutes(value) {
  const [hours, minutes] = String(value).split(':').map(Number)
  return Number.isFinite(hours) && Number.isFinite(minutes) ? (hours * 60) + minutes : null
}

function getBangkokMinutes(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]))
  return (Number(values.hour) * 60) + Number(values.minute)
}

function formatDurationMinutes(value) {
  const totalMinutes = Math.max(0, Math.floor(Number(value) || 0))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours} ชม. ${minutes} นาที` : `${minutes} นาที`
}

function getAttendanceRule(type, timestamp) {
  const actualMinutes = getBangkokMinutes(timestamp)
  const targetMinutes = timeToMinutes(type === 'check-in' ? WORK_START_TIME : WORK_END_TIME)
  if (actualMinutes === null || targetMinutes === null) return null

  if (type === 'check-in' && actualMinutes > targetMinutes + WORK_GRACE_MINUTES) {
    return { status: 'late', minutes: actualMinutes - targetMinutes, label: `สาย ${formatDurationMinutes(actualMinutes - targetMinutes)}` }
  }
  if (type === 'check-in' && actualMinutes < targetMinutes) {
    return { status: 'early-arrival', minutes: targetMinutes - actualMinutes, label: `เข้าก่อนเวลา ${formatDurationMinutes(targetMinutes - actualMinutes)}` }
  }
  if (type === 'check-out' && actualMinutes < targetMinutes) {
    return { status: 'early', minutes: targetMinutes - actualMinutes, label: `ออกก่อนเวลา ${formatDurationMinutes(targetMinutes - actualMinutes)}` }
  }
  if (type === 'check-out' && actualMinutes > targetMinutes) {
    return { status: 'after-hours', minutes: actualMinutes - targetMinutes, label: `ออกหลังเวลา ${formatDurationMinutes(actualMinutes - targetMinutes)}` }
  }
  return { status: 'on-time', minutes: 0, label: 'ตรงตามเวลางาน' }
}

function getWorkSchedule() {
  return { start: WORK_START_TIME, end: WORK_END_TIME, graceMinutes: WORK_GRACE_MINUTES }
}

function calculateWorkDayFraction(hours) {
  const standardDailyHours = Number(process.env.STANDARD_DAILY_HOURS || 8)
  const totalHours = Math.max(0, Number(hours) || 0)
  if (totalHours >= standardDailyHours) return 1
  if (totalHours >= standardDailyHours / 2) return 0.5
  return 0
}

function getWorkStatus(fraction) {
  if (fraction >= 1) return 'full-day'
  if (fraction >= 0.5) return 'half-day'
  return null
}

function calculateWorkSummary(checkInTime, checkOutTime) {
  const seconds = Math.max(0, Math.floor((new Date(checkOutTime) - new Date(checkInTime)) / 1000))
  const hours = seconds / 3600
  return {
    seconds,
    hours: Number(hours.toFixed(2)),
  }
}

function normalizeAdminTimestamp(value) {
  const input = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return null
  const date = new Date(`${input}:00+07:00`)
  if (Number.isNaN(date.getTime())) return null
  return `${input.replace('T', ' ')}:00`
}

function toDateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value || '').slice(0, 10)
}

async function refreshAttendanceDay(connection, userId, workDate) {
  if (!workDate) return
  const [rows] = await connection.execute(`
    SELECT a.id, TIMESTAMPDIFF(SECOND, check_in.timestamp, a.timestamp) AS work_seconds
    FROM attendance a
    LEFT JOIN attendance check_in ON check_in.id = a.check_in_id
    WHERE a.user_id = ? AND a.work_date = ? AND a.type = 'check-out' AND a.check_in_id IS NOT NULL
  `, [userId, workDate])
  const totalSeconds = rows.reduce((total, row) => total + Math.max(0, Number(row.work_seconds || 0)), 0)
  const totalHours = totalSeconds / 3600
  const workFraction = calculateWorkDayFraction(totalHours)
  const workStatus = getWorkStatus(workFraction)
  for (const row of rows) {
    await connection.execute(
      'UPDATE attendance SET work_hours = ?, work_fraction = ?, work_status = ? WHERE id = ?',
      [Number((Math.max(0, Number(row.work_seconds || 0)) / 3600).toFixed(2)), workFraction, workStatus, row.id],
    )
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
    return res.status(201).json({ message: 'ลงเวลาเข้างานสำเร็จ', attendanceId: result.insertId, distance: location.distance, attendanceRule: getAttendanceRule('check-in', new Date()), workSchedule: getWorkSchedule() })
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
    const [[todayTotals]] = await db.execute(`
      SELECT COALESCE(SUM(TIMESTAMPDIFF(SECOND, check_in.timestamp, a.timestamp)), 0) AS completed_seconds
      FROM attendance a
      INNER JOIN attendance check_in ON check_in.id = a.check_in_id
      WHERE a.user_id = ? AND a.type = 'check-out' AND a.work_date = CURDATE()
    `, [req.auth.sub])
    const totalWorkHours = (Number(todayTotals.completed_seconds || 0) + work.seconds) / 3600
    const workFraction = calculateWorkDayFraction(totalWorkHours)
    const workStatus = getWorkStatus(workFraction)
    const [result] = await db.execute(
      'INSERT INTO attendance (user_id, type, timestamp, work_date, latitude, longitude, distance_meters, check_in_id, work_hours, work_fraction, work_status) VALUES (?, \'check-out\', ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?)',
      [req.auth.sub, checkOutTime, location.latitude, location.longitude, location.distance, latest.id, work.hours, workFraction, workStatus],
    )

    return res.status(201).json({ message: 'ลงเวลาออกงานสำเร็จ', attendanceId: result.insertId, workSeconds: work.seconds, workHours: work.hours, workFraction, workStatus, totalWorkHours: Number(totalWorkHours.toFixed(2)), attendanceRule: getAttendanceRule('check-out', checkOutTime), workSchedule: getWorkSchedule() })
  } catch (error) {
    return next(error)
  }
})

router.get('/admin/history', [
  query('userId').optional().isInt({ min: 1 }).withMessage('รหัสพนักงานไม่ถูกต้อง'),
  query('startDate').optional().isISO8601().withMessage('วันที่เริ่มต้นไม่ถูกต้อง'),
  query('endDate').optional().isISO8601().withMessage('วันที่สิ้นสุดไม่ถูกต้อง'),
], requireAuth, requireRole('admin'), async (req, res, next) => {
  if (validateRequest(req, res)) return
  const conditions = ['1 = 1']
  const values = []
  if (req.query.userId) {
    conditions.push('a.user_id = ?')
    values.push(Number(req.query.userId))
  }
  if (req.query.startDate) {
    conditions.push('a.work_date >= ?')
    values.push(req.query.startDate)
  }
  if (req.query.endDate) {
    conditions.push('a.work_date <= ?')
    values.push(req.query.endDate)
  }

  try {
    const [rows] = await db.execute(`
      SELECT a.id, a.user_id, u.full_name, u.email, u.employee_code,
        a.type, a.timestamp, DATE_FORMAT(a.work_date, '%Y-%m-%d') AS work_date,
        a.check_in_id, a.work_hours, a.work_fraction, a.work_status,
        CASE WHEN a.type = 'check-out' AND a.check_in_id IS NOT NULL
          THEN TIMESTAMPDIFF(SECOND, check_in.timestamp, a.timestamp) ELSE NULL END AS work_seconds
      FROM attendance a
      INNER JOIN users u ON u.id = a.user_id
      LEFT JOIN attendance check_in ON check_in.id = a.check_in_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.timestamp DESC, a.id DESC
      LIMIT 500
    `, values)
    return res.json({ rows: rows.map((row) => ({
      ...row,
      work_seconds: Number(row.work_seconds || 0),
      work_hours: Number((Number(row.work_seconds || 0) / 3600).toFixed(4)),
      attendance_rule: getAttendanceRule(row.type, row.timestamp),
    })) })
  } catch (error) {
    return next(error)
  }
})

router.patch('/:id', [
  body('timestamp').matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).withMessage('รูปแบบวันเวลาต้องเป็น YYYY-MM-DDTHH:mm'),
], requireAuth, requireRole('admin'), async (req, res, next) => {
  if (validateRequest(req, res)) return
  const timestamp = normalizeAdminTimestamp(req.body.timestamp)
  if (!timestamp) return res.status(400).json({ message: 'วันเวลาไม่ถูกต้อง' })

  let connection
  try {
    connection = await db.getConnection()
    await connection.beginTransaction()
    const [[attendance]] = await connection.execute('SELECT id, user_id, type, work_date, check_in_id FROM attendance WHERE id = ? LIMIT 1', [req.params.id])
    if (!attendance) {
      await connection.rollback()
      return res.status(404).json({ message: 'ไม่พบประวัติการลงเวลา' })
    }

    const previousWorkDate = toDateOnly(attendance.work_date)
    const nextWorkDate = timestamp.slice(0, 10)
    await connection.execute('UPDATE attendance SET timestamp = ?, work_date = ? WHERE id = ?', [timestamp, nextWorkDate, req.params.id])

    if (attendance.type === 'check-in') {
      await connection.execute('UPDATE attendance SET work_date = DATE(timestamp) WHERE check_in_id = ?', [req.params.id])
    }

    if (attendance.type === 'check-out' && attendance.check_in_id) {
      const [[checkIn]] = await connection.execute('SELECT timestamp FROM attendance WHERE id = ? LIMIT 1', [attendance.check_in_id])
      if (!checkIn) {
        await connection.rollback()
        return res.status(409).json({ message: 'ไม่พบเวลาเข้างานที่คู่กับรายการนี้' })
      }
      const work = calculateWorkSummary(checkIn.timestamp, timestamp)
      await connection.execute('UPDATE attendance SET work_hours = ? WHERE id = ?', [work.hours, req.params.id])
    }

    await refreshAttendanceDay(connection, attendance.user_id, previousWorkDate)
    if (nextWorkDate !== previousWorkDate) await refreshAttendanceDay(connection, attendance.user_id, nextWorkDate)
    await connection.commit()
    return res.json({ message: 'แก้ไขประวัติลงเวลาสำเร็จ' })
  } catch (error) {
    if (connection) await connection.rollback()
    return next(error)
  } finally {
    connection?.release()
  }
})

router.get('/me', [
  query('month').optional().matches(/^\d{4}-\d{2}$/).withMessage('รูปแบบเดือนต้องเป็น YYYY-MM'),
], requireAuth, async (req, res, next) => {
  if (validateRequest(req, res)) return

  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7)
    const [logs] = await db.execute('SELECT a.id, a.type, a.`timestamp`, a.latitude, a.longitude, a.distance_meters, a.work_hours, a.work_fraction, a.work_status, a.check_in_id, CASE WHEN a.type = \'check-out\' AND a.check_in_id IS NOT NULL THEN TIMESTAMPDIFF(SECOND, check_in.`timestamp`, a.`timestamp`) ELSE NULL END AS work_seconds FROM attendance a LEFT JOIN attendance check_in ON check_in.id = a.check_in_id WHERE a.user_id = ? AND DATE_FORMAT(a.`timestamp`, \'%Y-%m\') = ? ORDER BY a.`timestamp` DESC, a.id DESC', [req.auth.sub, month])
    const logsWithRules = logs.map((log) => ({ ...log, attendance_rule: getAttendanceRule(log.type, log.timestamp) }))
    const [summaryRows] = await db.execute('SELECT COALESCE(SUM(CASE WHEN a.type = \'check-out\' AND check_in.id IS NOT NULL THEN TIMESTAMPDIFF(SECOND, check_in.`timestamp`, a.`timestamp`) ELSE 0 END), 0) AS total_seconds, u.wage_type, u.wage_rate FROM users u LEFT JOIN attendance a ON a.user_id = u.id AND DATE_FORMAT(a.`timestamp`, \'%Y-%m\') = ? LEFT JOIN attendance check_in ON check_in.id = a.check_in_id WHERE u.id = ? GROUP BY u.wage_type, u.wage_rate', [month, req.auth.sub])
    const [dailyRows] = await db.execute('SELECT a.work_date, COALESCE(SUM(CASE WHEN a.type = \'check-out\' AND check_in.id IS NOT NULL THEN TIMESTAMPDIFF(SECOND, check_in.`timestamp`, a.`timestamp`) ELSE 0 END), 0) AS total_seconds FROM attendance a LEFT JOIN attendance check_in ON check_in.id = a.check_in_id WHERE a.user_id = ? AND a.work_date >= ? AND a.work_date < DATE_ADD(?, INTERVAL 1 MONTH) GROUP BY a.work_date', [req.auth.sub, `${month}-01`, `${month}-01`])
    const [todayRows] = await db.execute('SELECT a.type, a.`timestamp`, a.work_hours, a.work_fraction, a.work_status, CASE WHEN a.type = \'check-out\' AND a.check_in_id IS NOT NULL THEN TIMESTAMPDIFF(SECOND, check_in.`timestamp`, a.`timestamp`) ELSE NULL END AS work_seconds FROM attendance a LEFT JOIN attendance check_in ON check_in.id = a.check_in_id WHERE a.user_id = ? AND DATE(a.`timestamp`) = CURDATE() ORDER BY a.`timestamp` DESC, a.id DESC LIMIT 1', [req.auth.sub])
    const summary = summaryRows[0] || { total_seconds: 0, wage_type: 'hourly', wage_rate: process.env.HOURLY_WAGE || 50 }
    summary.total_seconds = Number(summary.total_seconds || 0)
    summary.total_hours = Number((summary.total_seconds / 3600).toFixed(4))
    summary.total_work_days = dailyRows.reduce((total, row) => total + calculateWorkDayFraction(Number(row.total_seconds || 0) / 3600), 0)
    const wageType = summary.wage_type || 'hourly'
    const wageRate = Number(summary.wage_rate || process.env.HOURLY_WAGE || 50)
    const effectiveHourlyWage = wageType === 'hourly' ? wageRate : wageType === 'daily' ? wageRate / Number(process.env.STANDARD_DAILY_HOURS || 8) : wageRate / (Number(process.env.STANDARD_MONTHLY_DAYS || 22) * Number(process.env.STANDARD_DAILY_HOURS || 8))
    summary.wage_type = wageType
    summary.wage_rate = wageRate
    summary.hourly_wage = Number(effectiveHourlyWage.toFixed(2))
    const testMode = process.env.ATTENDANCE_TEST_MODE === 'true' && wageType === 'hourly'
    const testMinuteWage = Number(process.env.TEST_MINUTE_WAGE || 50)
    summary.test_mode = testMode
    summary.test_minute_wage = testMinuteWage
    summary.estimated_wage = testMode
      ? Number((Math.round(summary.total_seconds / 60) * testMinuteWage).toFixed(2))
      : Number((Number(summary.total_hours) * effectiveHourlyWage).toFixed(2))

    const today = todayRows[0] || null
    if (today) {
      const [[todayTotals]] = await db.execute('SELECT COALESCE(SUM(CASE WHEN a.type = \'check-out\' AND check_in.id IS NOT NULL THEN TIMESTAMPDIFF(SECOND, check_in.`timestamp`, a.`timestamp`) ELSE 0 END), 0) AS total_seconds FROM attendance a LEFT JOIN attendance check_in ON check_in.id = a.check_in_id WHERE a.user_id = ? AND a.work_date = CURDATE()', [req.auth.sub])
      today.work_fraction = calculateWorkDayFraction(Number(todayTotals.total_seconds || 0) / 3600)
      today.work_status = getWorkStatus(today.work_fraction)
      today.attendance_rule = getAttendanceRule(today.type, today.timestamp)
    }
    return res.json({ month, logs: logsWithRules, summary, today, workSchedule: getWorkSchedule() })
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
        COALESCE(SUM(CASE WHEN a.type = 'check-out' AND check_in.id IS NOT NULL THEN TIMESTAMPDIFF(SECOND, check_in.timestamp, a.timestamp) ELSE 0 END), 0) AS work_seconds
      FROM attendance a
      INNER JOIN users u ON u.id = a.user_id
      LEFT JOIN attendance check_in ON check_in.id = a.check_in_id
      WHERE DATE(a.timestamp) = CURDATE()
      GROUP BY a.user_id, u.full_name, u.email, u.employee_code
      ORDER BY first_check_in ASC
    `)
    const normalizedRows = rows.map((row) => {
      const workSeconds = Number(row.work_seconds || 0)
      const workHours = workSeconds / 3600
      const workFraction = calculateWorkDayFraction(workHours)
      const testMode = process.env.ATTENDANCE_TEST_MODE === 'true'
      const estimatedWage = testMode
        ? Math.round(workSeconds / 60) * Number(process.env.TEST_MINUTE_WAGE || 50)
        : workHours * Number(process.env.HOURLY_WAGE || 50)
      const attendanceRule = row.current_type === 'check-in'
        ? getAttendanceRule('check-in', row.latest_timestamp)
        : getAttendanceRule('check-out', row.latest_timestamp)
      return { ...row, work_seconds: workSeconds, work_hours: Number(workHours.toFixed(4)), work_fraction: workFraction, work_status: getWorkStatus(workFraction), attendance_rule: attendanceRule, work_schedule: getWorkSchedule(), estimated_wage: Number(estimatedWage.toFixed(2)) }
    })
    return res.json({ date: new Date().toISOString().slice(0, 10), rows: normalizedRows })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
