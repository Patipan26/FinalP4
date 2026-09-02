const mysql = require('mysql2/promise')
const path = require('path')
const dotenv = require('dotenv')

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

async function promoteAdmin() {
  const email = process.argv[2]?.trim().toLowerCase()
  if (!email) {
    console.error('กรุณาระบุอีเมล เช่น npm run admin:promote -- admin@example.com')
    process.exitCode = 1
    return
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || 'carcare_db',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  })

  try {
    const [result] = await connection.execute('UPDATE users SET role = \'admin\' WHERE email = ?', [email])
    if (result.affectedRows === 0) {
      console.error(`ไม่พบผู้ใช้ ${email} กรุณาสมัครสมาชิกก่อน`)
      process.exitCode = 1
      return
    }
    console.log(`ตั้ง ${email} เป็น Admin สำเร็จ`)
  } finally {
    await connection.end()
  }
}

promoteAdmin().catch((error) => {
  console.error(`ตั้งสิทธิ์ Admin ไม่สำเร็จ: ${error.code || error.message}`)
  process.exitCode = 1
})
