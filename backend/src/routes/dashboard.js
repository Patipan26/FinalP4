const express = require('express')

const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()

router.get('/summary', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const [[employeeCount]] = await db.execute("SELECT COUNT(*) AS total FROM users WHERE role = 'employee' AND status = 'active'")
    const [[presentToday]] = await db.execute("SELECT COUNT(DISTINCT user_id) AS total FROM attendance WHERE type = 'check-in' AND DATE(`timestamp`) = CURDATE()")
    const [[pendingLeaves]] = await db.execute("SELECT COUNT(*) AS total FROM leave_requests WHERE status = 'pending'")
    const total = Number(employeeCount.total)
    const present = Number(presentToday.total)
    return res.json({
      totalEmployees: total,
      presentToday: present,
      presentPercent: total ? Math.round((present / total) * 100) : 0,
      pendingLeaves: Number(pendingLeaves.total),
    })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
