const express = require('express')
const { body, validationResult } = require('express-validator')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

const db = require('../db')
const { jwtSecret, requireAuth } = require('../middleware/auth')

const router = express.Router()

const userFields = 'id, full_name, email, employee_code, position, role, status, wage_type, wage_rate, created_at'
const googleClientId = process.env.GOOGLE_CLIENT_ID || ''

function getValidationErrors(req, res) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() })
    return true
  }
  return false
}

function createToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, jwtSecret, { expiresIn: '8h' })
}

router.post('/register', [
  body('fullName').trim().isLength({ min: 2, max: 150 }).withMessage('กรุณากรอกชื่อ-นามสกุลอย่างน้อย 2 ตัวอักษร'),
  body('email').trim().isEmail().withMessage('รูปแบบอีเมลไม่ถูกต้อง').normalizeEmail(),
  body('password').isLength({ min: 6, max: 72 }).withMessage('รหัสผ่านต้องมีความยาว 6-72 ตัวอักษร'),
], async (req, res, next) => {
  if (getValidationErrors(req, res)) return

  const fullName = req.body.fullName.trim()
  const email = req.body.email.toLowerCase()
  const passwordHash = await bcrypt.hash(req.body.password, 12)

  try {
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email])
    if (existing.length > 0) {
      return res.status(409).json({ message: 'อีเมลนี้ถูกใช้งานแล้ว' })
    }

    const [result] = await db.execute(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [fullName, email, passwordHash, 'employee'],
    )

    const employeeCode = `EMP-${String(result.insertId).padStart(3, '0')}`
    await db.execute('UPDATE users SET employee_code = ? WHERE id = ?', [employeeCode, result.insertId])

    const [users] = await db.execute(`SELECT ${userFields} FROM users WHERE id = ?`, [result.insertId])
    return res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ', user: users[0] })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'อีเมลหรือรหัสพนักงานนี้ถูกใช้งานแล้ว' })
    }
    return next(error)
  }
})

router.post('/login', [
  body('email').trim().isEmail().withMessage('รูปแบบอีเมลไม่ถูกต้อง').normalizeEmail(),
  body('password').isLength({ min: 1 }).withMessage('กรุณากรอกรหัสผ่าน'),
], async (req, res, next) => {
  if (getValidationErrors(req, res)) return

  try {
    const email = req.body.email.toLowerCase()
    const [users] = await db.execute('SELECT id, full_name, email, employee_code, position, role, status, wage_type, wage_rate, password_hash, created_at FROM users WHERE email = ? LIMIT 1', [email])
    const user = users[0]

    if (!user || !user.password_hash || !(await bcrypt.compare(req.body.password, user.password_hash))) {
      return res.status(401).json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })
    }

    if (user.status !== 'active') {
      return res.status(403).json({ message: 'บัญชีนี้ถูกปิดใช้งาน' })
    }

    delete user.password_hash
    return res.json({ message: 'เข้าสู่ระบบสำเร็จ', token: createToken(user), user })
  } catch (error) {
    return next(error)
  }
})

router.post('/google', [
  body('idToken').isString().trim().isLength({ min: 1, max: 5000 }).withMessage('Google token ไม่ถูกต้อง'),
], async (req, res, next) => {
  if (getValidationErrors(req, res)) return
  if (!googleClientId) return res.status(503).json({ message: 'ระบบยังไม่ได้ตั้งค่า Google Client ID' })

  try {
    const googleResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(req.body.idToken)}`)
    if (!googleResponse.ok) return res.status(401).json({ message: 'Google token หมดอายุหรือไม่ถูกต้อง' })

    const googleUser = await googleResponse.json()
    if (googleUser.aud !== googleClientId || googleUser.iss !== 'https://accounts.google.com' || googleUser.email_verified !== 'true' || !googleUser.email || !googleUser.sub) {
      return res.status(401).json({ message: 'ยืนยันบัญชี Google ไม่สำเร็จ' })
    }

    const email = googleUser.email.toLowerCase()
    const fullName = String(googleUser.name || email.split('@')[0]).trim().slice(0, 150)
    const [existingUsers] = await db.execute('SELECT id FROM users WHERE email = ? OR google_subject = ? LIMIT 1', [email, googleUser.sub])
    let userId = existingUsers[0]?.id

    if (!userId) {
      const [result] = await db.execute('INSERT INTO users (full_name, email, password_hash, google_subject, role) VALUES (?, ?, NULL, ?, \'employee\')', [fullName, email, googleUser.sub])
      userId = result.insertId
      const employeeCode = `EMP-${String(userId).padStart(3, '0')}`
      await db.execute('UPDATE users SET employee_code = ? WHERE id = ?', [employeeCode, userId])
    } else {
      await db.execute('UPDATE users SET google_subject = COALESCE(google_subject, ?) WHERE id = ?', [googleUser.sub, userId])
    }

    const [users] = await db.execute(`SELECT ${userFields} FROM users WHERE id = ? LIMIT 1`, [userId])
    const user = users[0]
    if (!user) return res.status(401).json({ message: 'ไม่พบบัญชีผู้ใช้ Google' })
    if (user.status !== 'active') return res.status(403).json({ message: 'บัญชีนี้ถูกปิดใช้งาน' })
    return res.json({ message: 'เข้าสู่ระบบด้วย Google สำเร็จ', token: createToken(user), user })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'บัญชี Google นี้ถูกใช้งานแล้ว' })
    return next(error)
  }
})

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [users] = await db.execute(`SELECT ${userFields} FROM users WHERE id = ? AND status = 'active' LIMIT 1`, [req.auth.sub])
    if (users.length === 0) return res.status(404).json({ message: 'ไม่พบผู้ใช้งาน' })
    return res.json({ user: users[0] })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
