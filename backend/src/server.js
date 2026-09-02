require('dotenv').config()

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')

const db = require('./db')
const authRoutes = require('./routes/auth')
const attendanceRoutes = require('./routes/attendance')
const leaveRoutes = require('./routes/leaves')
const userRoutes = require('./routes/users')
const dashboardRoutes = require('./routes/dashboard')
const overtimeRoutes = require('./routes/overtime')
const payrollRoutes = require('./routes/payrolls')

const app = express()
const port = Number(process.env.PORT || 4000)

app.use(helmet())
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }))
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/attendance', attendanceRoutes)
app.use('/api/leaves', leaveRoutes)
app.use('/api/users', userRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/overtime', overtimeRoutes)
app.use('/api/payrolls', payrollRoutes)

app.get('/api/health', async (req, res) => {
  let database = 'not_checked'

  try {
    await db.query('SELECT 1')
    database = 'connected'
  } catch (error) {
    database = 'disconnected'
  }

  res.json({
    ok: true,
    service: 'finalp4-backend',
    database,
    timestamp: new Date().toISOString(),
  })
})

app.get('/api', (req, res) => {
  res.json({ message: 'FinalP4 Car Care API is running' })
})

app.use((req, res) => {
  res.status(404).json({ message: 'ไม่พบ API ที่เรียก' })
})

app.use((error, req, res, next) => {
  console.error(error)
  if (['ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'PROTOCOL_CONNECTION_LOST'].includes(error.code)) {
    return res.status(503).json({ message: 'MySQL ยังไม่พร้อมใช้งาน กรุณาตรวจสอบการตั้งค่าในไฟล์ .env' })
  }
  res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' })
})

app.listen(port, () => {
  console.log(`FinalP4 backend listening on http://localhost:${port}`)
})
