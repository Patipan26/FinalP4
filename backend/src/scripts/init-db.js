const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
const dotenv = require('dotenv')

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

async function initializeDatabase() {
  const schemaPath = path.resolve(__dirname, '../../../database/schema.sql')
  const schema = fs.readFileSync(schemaPath, 'utf8')
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    charset: 'UTF8MB4_UNICODE_CI',
    multipleStatements: true,
  })

  try {
    await connection.query(schema)
    console.log('สร้างฐานข้อมูลและตารางสำเร็จ')
  } finally {
    await connection.end()
  }
}

initializeDatabase().catch((error) => {
  console.error(`สร้างฐานข้อมูลไม่สำเร็จ: ${error.code || error.message}`)
  process.exitCode = 1
})
