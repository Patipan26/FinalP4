SET NAMES utf8mb4;

USE carcare_db;

ALTER TABLE attendance ADD COLUMN work_date DATE NULL;
UPDATE attendance SET work_date = DATE(`timestamp`) WHERE work_date IS NULL;
ALTER TABLE attendance MODIFY work_date DATE NOT NULL;
ALTER TABLE attendance ADD COLUMN check_in_id BIGINT UNSIGNED NULL;
ALTER TABLE attendance ADD COLUMN work_hours DECIMAL(5, 2) NULL;
ALTER TABLE attendance ADD COLUMN work_fraction DECIMAL(3, 2) NULL;
ALTER TABLE attendance ADD COLUMN work_status ENUM('half-day', 'full-day') NULL;

ALTER TABLE leave_requests MODIFY leave_type ENUM('ลาป่วย', 'ลากิจ', 'ลาพักร้อน', 'ลาครึ่งวัน') NOT NULL;
ALTER TABLE leave_requests ADD COLUMN leave_session ENUM('morning', 'afternoon') NULL;
ALTER TABLE leave_requests MODIFY status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending';
ALTER TABLE leave_requests ADD COLUMN cancelled_at DATETIME NULL;

CREATE TABLE IF NOT EXISTS leave_quotas (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  year YEAR NOT NULL,
  leave_type ENUM('ลาป่วย', 'ลากิจ', 'ลาพักร้อน', 'ลาครึ่งวัน') NOT NULL,
  quota_days DECIMAL(5, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_quota_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_quota_user_year_type (user_id, year, leave_type)
);

INSERT IGNORE INTO leave_quotas (user_id, year, leave_type, quota_days)
SELECT u.id, YEAR(CURDATE()), q.leave_type, q.quota_days
FROM users u
JOIN (
  SELECT 'ลาป่วย' AS leave_type, 30.00 AS quota_days
  UNION ALL SELECT 'ลากิจ', 6.00
  UNION ALL SELECT 'ลาพักร้อน', 6.00
  UNION ALL SELECT 'ลาครึ่งวัน', 6.00
) q;
