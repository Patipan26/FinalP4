const jwt = require('jsonwebtoken')

const jwtSecret = process.env.JWT_SECRET || 'finalp4-development-secret'

function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null

  if (!token) {
    return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' })
  }

  try {
    req.auth = jwt.verify(token, jwtSecret)
    return next()
  } catch (error) {
    return res.status(401).json({ message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' })
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.auth?.role)) {
      return res.status(403).json({ message: 'คุณไม่มีสิทธิ์ใช้งานส่วนนี้' })
    }
    return next()
  }
}

module.exports = { jwtSecret, requireAuth, requireRole }
