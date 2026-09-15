const express = require('express')
const { body, validationResult } = require('express-validator')

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

router.get('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const [rows] = await db.execute('SELECT id, full_name, email, employee_code, position, role, status, wage_type, wage_rate, created_at FROM users ORDER BY id ASC')
    return res.json({ rows })
  } catch (error) {
    return next(error)
  }
})

router.patch('/:id', [
  body('fullName').optional().trim().isLength({ min: 2, max: 150 }).withMessage('ชื่อ-นามสกุลต้องมีความยาว 2-150 ตัวอักษร'),
  body('position').optional().trim().isLength({ max: 100 }).withMessage('ตำแหน่งยาวเกินไป'),
  body('role').optional().isIn(['employee', 'admin']).withMessage('สิทธิ์ผู้ใช้ไม่ถูกต้อง'),
  body('status').optional().isIn(['active', 'inactive']).withMessage('สถานะผู้ใช้ไม่ถูกต้อง'),
  body('wageType').optional().isIn(['hourly', 'daily', 'monthly']).withMessage('ประเภทค่าจ้างไม่ถูกต้อง'),
  body('wageRate').optional().isFloat({ min: 0, max: 10000000 }).withMessage('อัตราค่าจ้างไม่ถูกต้อง'),
], requireAuth, requireRole('admin'), async (req, res, next) => {
  if (validateRequest(req, res)) return
  const updates = []
  const values = []
  const fields = { fullName: 'full_name', position: 'position', role: 'role', status: 'status', wageType: 'wage_type', wageRate: 'wage_rate' }

  for (const [bodyField, column] of Object.entries(fields)) {
    if (req.body[bodyField] !== undefined) {
      updates.push(`${column} = ?`)
      values.push(bodyField === 'wageRate' ? Number(req.body[bodyField]) : typeof req.body[bodyField] === 'string' ? req.body[bodyField].trim() : req.body[bodyField])
    }
  }
  if (updates.length === 0) return res.status(400).json({ message: 'ไม่มีข้อมูลที่ต้องแก้ไข' })

  values.push(req.params.id)
  try {
    const [result] = await db.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values)
    if (result.affectedRows === 0) return res.status(404).json({ message: 'ไม่พบผู้ใช้งาน' })
    return res.json({ message: 'อัปเดตข้อมูลผู้ใช้สำเร็จ' })
  } catch (error) {
    return next(error)
  }
})

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  if (Number(req.params.id) === Number(req.auth.sub)) {
    return res.status(400).json({ message: 'ไม่สามารถลบบัญชี Admin ที่กำลังใช้งานอยู่ได้' })
  }

  try {
    const [result] = await db.execute("UPDATE users SET status = 'inactive' WHERE id = ? AND role = 'employee'", [req.params.id])
    if (result.affectedRows === 0) return res.status(404).json({ message: 'ไม่พบพนักงานที่สามารถลบได้' })
    return res.json({ message: 'ลบพนักงานออกจากการใช้งานสำเร็จ และเก็บประวัติเดิมไว้แล้ว' })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
