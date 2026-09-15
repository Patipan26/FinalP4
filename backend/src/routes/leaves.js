const express = require('express')
const { body, validationResult } = require('express-validator')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const multer = require('multer')

const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()
const DEFAULT_QUOTAS = { 'ลาป่วย': 30, 'ลากิจ': 6, 'ลาพักร้อน': 6, 'ลาครึ่งวัน': 6 }
const LEAVE_TYPES = Object.keys(DEFAULT_QUOTAS)
const uploadDirectory = path.resolve(__dirname, '../../uploads/leave')
const allowedAttachmentTypes = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const attachmentExtensions = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }

fs.mkdirSync(uploadDirectory, { recursive: true })

const leaveAttachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDirectory),
    filename: (_req, file, callback) => callback(null, `leave-${crypto.randomUUID()}${attachmentExtensions[file.mimetype] || path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!allowedAttachmentTypes.has(file.mimetype)) return callback(new Error('รองรับเฉพาะไฟล์ PDF, JPG และ PNG'))
    return callback(null, true)
  },
})

function uploadAttachment(req, res, next) {
  leaveAttachmentUpload.single('attachment')(req, res, (error) => {
    if (!error) return next()
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'ไฟล์แนบต้องมีขนาดไม่เกิน 5 MB' })
    return res.status(400).json({ message: error.message || 'ไฟล์แนบไม่ถูกต้อง' })
  })
}

function removeUploadedFile(file) {
  if (file?.path) fs.unlink(file.path, () => {})
}

function decodeAttachmentName(fileName) {
  if (!fileName || !/[à¸à¹ÃÂ]/.test(fileName)) return fileName
  const decoded = Buffer.from(fileName, 'latin1').toString('utf8')
  return decoded.includes('\uFFFD') ? fileName : decoded
}

function validateRequest(req, res) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() })
    return true
  }
  return false
}

function dateDifferenceInDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  return Math.ceil((end - start) / 86400000) + 1
}

function getTodayInBangkok() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

async function ensureQuotas(userId, year) {
  for (const [leaveType, quotaDays] of Object.entries(DEFAULT_QUOTAS)) {
    await db.execute('INSERT IGNORE INTO leave_quotas (user_id, year, leave_type, quota_days) VALUES (?, ?, ?, ?)', [userId, year, leaveType, quotaDays])
  }
}

async function getQuotaSummary(userId, year) {
  await ensureQuotas(userId, year)
  const [rows] = await db.execute(`
    SELECT q.leave_type, q.quota_days,
      COALESCE(SUM(CASE WHEN l.status IN ('pending', 'approved') THEN l.days ELSE 0 END), 0) AS used_days
    FROM leave_quotas q
    LEFT JOIN leave_requests l
      ON l.user_id = q.user_id AND l.leave_type = q.leave_type AND YEAR(l.start_date) = q.year
    WHERE q.user_id = ? AND q.year = ?
    GROUP BY q.leave_type, q.quota_days
    ORDER BY q.leave_type
  `, [userId, year])
  return rows.map((row) => ({ ...row, remaining_days: Math.max(0, Number(row.quota_days) - Number(row.used_days)) }))
}

router.post('/', requireAuth, uploadAttachment, [
  body('leaveType').isIn(LEAVE_TYPES).withMessage('ประเภทการลาไม่ถูกต้อง'),
  body('startDate').isISO8601().withMessage('วันที่เริ่มลาไม่ถูกต้อง'),
  body('endDate').isISO8601().withMessage('วันที่สิ้นสุดไม่ถูกต้อง'),
  body('reason').trim().isLength({ min: 2, max: 1000 }).withMessage('กรุณาระบุเหตุผลการลา'),
  body('session').custom((value) => !value || ['morning', 'afternoon'].includes(value)).withMessage('ช่วงเวลาลาครึ่งวันไม่ถูกต้อง'),
], async (req, res, next) => {
  if (validateRequest(req, res)) {
    removeUploadedFile(req.file)
    return
  }

  const { leaveType, startDate, endDate, reason, session } = req.body
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  if (startDate < getTodayInBangkok()) {
    removeUploadedFile(req.file)
    return res.status(400).json({ message: 'ไม่สามารถยื่นใบลาย้อนหลังได้ กรุณาเลือกวันนี้หรือวันถัดไป' })
  }
  if (end < start) {
    removeUploadedFile(req.file)
    return res.status(400).json({ message: 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มลา' })
  }
  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    removeUploadedFile(req.file)
    return res.status(400).json({ message: 'การลาข้ามปีต้องแยกเป็นคนละรายการ' })
  }

  const isHalfDay = leaveType === 'ลาครึ่งวัน'
  if (isHalfDay && startDate !== endDate) {
    removeUploadedFile(req.file)
    return res.status(400).json({ message: 'ลาครึ่งวันต้องเลือกวันเดียวกัน' })
  }
  if (isHalfDay && !session) {
    removeUploadedFile(req.file)
    return res.status(400).json({ message: 'กรุณาเลือกช่วงเช้าหรือช่วงบ่าย' })
  }
  if (!isHalfDay && session) {
    removeUploadedFile(req.file)
    return res.status(400).json({ message: 'การลาเต็มวันไม่ต้องเลือกช่วงเวลา' })
  }

  const days = isHalfDay ? 0.5 : dateDifferenceInDays(startDate, endDate)
  const year = start.getUTCFullYear()

  try {
    const [quotaRows] = await db.execute('SELECT quota_days FROM leave_quotas WHERE user_id = ? AND year = ? AND leave_type = ? LIMIT 1', [req.auth.sub, year, leaveType])
    const quota = quotaRows[0] || { quota_days: DEFAULT_QUOTAS[leaveType] }
    const [usedRows] = await db.execute('SELECT COALESCE(SUM(days), 0) AS used_days FROM leave_requests WHERE user_id = ? AND leave_type = ? AND YEAR(start_date) = ? AND status IN (\'pending\', \'approved\')', [req.auth.sub, leaveType, year])
    const remaining = Number(quota.quota_days) - Number(usedRows[0].used_days)
    if (remaining < days) {
      removeUploadedFile(req.file)
      return res.status(409).json({ message: `โควตา${leaveType}คงเหลือไม่พอ (เหลือ ${Math.max(0, remaining)} วัน)` })
    }

    const [result] = await db.execute(
      'INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, days, reason, leave_session, attachment_original_name, attachment_stored_name, attachment_mime, attachment_size, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'pending\')',
      [req.auth.sub, leaveType, startDate, endDate, days, reason.trim(), session || null, decodeAttachmentName(req.file?.originalname) || null, req.file?.filename || null, req.file?.mimetype || null, req.file?.size || null],
    )
    return res.status(201).json({ message: 'ส่งคำขอลาสำเร็จ', leaveId: result.insertId, days })
  } catch (error) {
    removeUploadedFile(req.file)
    return next(error)
  }
})

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const year = Number(req.query.year || new Date().getFullYear())
    const [rows] = await db.execute('SELECT id, leave_type, start_date, end_date, days, reason, leave_session, attachment_original_name, attachment_mime, attachment_size, status, approved_at, created_at, cancelled_at FROM leave_requests WHERE user_id = ? AND YEAR(start_date) = ? ORDER BY created_at DESC, id DESC', [req.auth.sub, year])
    const quotas = await getQuotaSummary(req.auth.sub, year)
    return res.json({ year, rows: rows.map((row) => ({ ...row, attachment_original_name: decodeAttachmentName(row.attachment_original_name) })), quotas })
  } catch (error) {
    return next(error)
  }
})

router.get('/admin', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const [rows] = await db.execute(`
      SELECT l.id, l.user_id, u.full_name, u.email, u.employee_code,
        l.leave_type, l.start_date, l.end_date, l.days, l.reason,
        l.leave_session, l.attachment_original_name, l.attachment_mime, l.attachment_size,
        l.status, l.approved_at, l.created_at
      FROM leave_requests l
      INNER JOIN users u ON u.id = l.user_id
      ORDER BY l.created_at DESC, l.id DESC
    `)
    const quotaCache = new Map()
    const rowsWithQuotas = await Promise.all(rows.map(async (row) => {
      const year = new Date(row.start_date).getUTCFullYear()
      const cacheKey = `${row.user_id}:${year}`
      if (!quotaCache.has(cacheKey)) quotaCache.set(cacheKey, getQuotaSummary(row.user_id, year))
      const quotaRows = await quotaCache.get(cacheKey)
      const remainingQuotas = Object.fromEntries(quotaRows.map((quota) => [quota.leave_type, Number(quota.remaining_days)]))
      return { ...row, attachment_original_name: decodeAttachmentName(row.attachment_original_name), remaining_quotas: remainingQuotas }
    }))
    return res.json({ rows: rowsWithQuotas })
  } catch (error) {
    return next(error)
  }
})

router.get('/:id/attachment', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db.execute('SELECT user_id, attachment_original_name, attachment_stored_name, attachment_mime FROM leave_requests WHERE id = ? LIMIT 1', [req.params.id])
    const leave = rows[0]
    if (!leave?.attachment_stored_name) return res.status(404).json({ message: 'ไม่พบไฟล์แนบของใบลา' })
    if (req.auth.role !== 'admin' && Number(leave.user_id) !== Number(req.auth.sub)) return res.status(403).json({ message: 'คุณไม่มีสิทธิ์เปิดไฟล์แนบนี้' })

    const filePath = path.resolve(uploadDirectory, leave.attachment_stored_name)
    if (!filePath.startsWith(`${uploadDirectory}${path.sep}`)) return res.status(400).json({ message: 'ตำแหน่งไฟล์ไม่ถูกต้อง' })
    return res.download(filePath, decodeAttachmentName(leave.attachment_original_name) || 'leave-attachment', { headers: { 'Content-Type': leave.attachment_mime || 'application/octet-stream' } }, (error) => {
      if (error && !res.headersSent) next(error)
    })
  } catch (error) {
    return next(error)
  }
})

router.patch('/:id/status', [
  body('status').isIn(['pending', 'approved', 'rejected']).withMessage('สถานะใบลาไม่ถูกต้อง'),
], requireAuth, requireRole('admin'), async (req, res, next) => {
  if (validateRequest(req, res)) return

  try {
    const [result] = await db.execute('UPDATE leave_requests SET status = ?, approved_by = ?, approved_at = CASE WHEN ? = \'approved\' THEN NOW() ELSE NULL END WHERE id = ? AND status <> \'cancelled\'', [req.body.status, req.auth.sub, req.body.status, req.params.id])
    if (result.affectedRows === 0) return res.status(404).json({ message: 'ไม่พบใบลา หรือใบลาถูกยกเลิกแล้ว' })
    return res.json({ message: 'อัปเดตสถานะใบลาสำเร็จ' })
  } catch (error) {
    return next(error)
  }
})

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const [result] = await db.execute('UPDATE leave_requests SET status = \'cancelled\', cancelled_at = NOW() WHERE id = ? AND user_id = ? AND status = \'pending\'', [req.params.id, req.auth.sub])
    if (result.affectedRows === 0) return res.status(409).json({ message: 'ยกเลิกได้เฉพาะใบลาที่กำลังรออนุมัติของคุณเท่านั้น' })
    return res.json({ message: 'ยกเลิกคำขอลาสำเร็จ' })
  } catch (error) {
    return next(error)
  }
})

router.get('/quotas/me', requireAuth, async (req, res, next) => {
  try {
    const year = Number(req.query.year || new Date().getFullYear())
    return res.json({ year, quotas: await getQuotaSummary(req.auth.sub, year) })
  } catch (error) {
    return next(error)
  }
})

router.put('/quotas/:userId', [
  body('leaveType').isIn(LEAVE_TYPES).withMessage('ประเภทการลาไม่ถูกต้อง'),
  body('quotaDays').isFloat({ min: 0, max: 365 }).withMessage('โควตาต้องเป็นตัวเลขตั้งแต่ 0 ถึง 365'),
], requireAuth, requireRole('admin'), async (req, res, next) => {
  if (validateRequest(req, res)) return
  const year = Number(req.body.year || new Date().getFullYear())

  try {
    await db.execute('INSERT INTO leave_quotas (user_id, year, leave_type, quota_days) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE quota_days = VALUES(quota_days)', [req.params.userId, year, req.body.leaveType, Number(req.body.quotaDays)])
    return res.json({ message: 'อัปเดตโควตาวันลาสำเร็จ' })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
