const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
const dotenv = require('dotenv')

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

async function migrateDatabase() {
  const migrationsPath = path.resolve(__dirname, '../../../database/migrations')
  const migrationFiles = fs.readdirSync(migrationsPath)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || 'carcare_db',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    charset: 'UTF8MB4_UNICODE_CI',
  })

  try {
    await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)')
    for (const file of migrationFiles) {
      const migrationId = path.basename(file, '.sql')
      const [applied] = await connection.execute('SELECT id FROM schema_migrations WHERE id = ? LIMIT 1', [migrationId])
      if (applied.length > 0) continue

      const migrationPath = path.join(migrationsPath, file)
      const statements = fs.readFileSync(migrationPath, 'utf8')
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean)

      for (const statement of statements) {
        try {
          await connection.query(statement)
        } catch (error) {
          if (!['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_DUP_COLUMN_NAME'].includes(error.code)) throw error
        }
      }
      await connection.execute('INSERT INTO schema_migrations (id) VALUES (?)', [migrationId])
      console.log(`ปรับฐานข้อมูลด้วย ${migrationId} สำเร็จ`)
    }
    console.log('ฐานข้อมูลเป็นเวอร์ชันล่าสุดแล้ว')
  } finally {
    await connection.end()
  }
}

migrateDatabase().catch((error) => {
  console.error(`ปรับโครงสร้างฐานข้อมูลไม่สำเร็จ: ${error.code || error.message}`)
  process.exitCode = 1
})
