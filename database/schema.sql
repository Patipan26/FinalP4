SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS carcare_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE carcare_db;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  google_subject VARCHAR(255) NULL UNIQUE,
  employee_code VARCHAR(30) UNIQUE,
  position VARCHAR(100) NOT NULL DEFAULT 'พนักงานประจำร้าน',
  role ENUM('employee', 'admin') NOT NULL DEFAULT 'employee',
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  wage_type ENUM('hourly', 'daily', 'monthly') NOT NULL DEFAULT 'hourly',
  wage_rate DECIMAL(12, 2) NOT NULL DEFAULT 50.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type ENUM('check-in', 'check-out') NOT NULL,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  work_date DATE NOT NULL,
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  distance_meters DECIMAL(10, 2),
  check_in_id BIGINT UNSIGNED NULL,
  work_hours DECIMAL(5, 2) NULL,
  work_fraction DECIMAL(3, 2) NULL,
  work_status ENUM('half-day', 'full-day') NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attendance_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_attendance_user_date (user_id, timestamp),
  INDEX idx_attendance_date (timestamp)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  leave_type ENUM('ลาป่วย', 'ลากิจ', 'ลาพักร้อน', 'ลาครึ่งวัน') NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days DECIMAL(5, 2) NOT NULL,
  reason TEXT NOT NULL,
  leave_session ENUM('morning', 'afternoon') NULL,
  attachment_original_name VARCHAR(255) NULL,
  attachment_stored_name VARCHAR(255) NULL,
  attachment_mime VARCHAR(100) NULL,
  attachment_size INT UNSIGNED NULL,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_leave_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_leave_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_leave_user (user_id),
  INDEX idx_leave_status (status)
);

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

CREATE TABLE IF NOT EXISTS payrolls (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  payroll_month DATE NOT NULL,
  wage_type ENUM('hourly', 'daily', 'monthly') NOT NULL DEFAULT 'hourly',
  wage_rate DECIMAL(12, 2) NOT NULL DEFAULT 50.00,
  regular_hours DECIMAL(10, 2) NOT NULL DEFAULT 0,
  regular_days DECIMAL(10, 2) NOT NULL DEFAULT 0,
  leave_days DECIMAL(10, 2) NOT NULL DEFAULT 0,
  overtime_hours DECIMAL(10, 2) NOT NULL DEFAULT 0,
  overtime_rate DECIMAL(10, 2) NOT NULL DEFAULT 1.50,
  regular_pay DECIMAL(12, 2) NOT NULL DEFAULT 0,
  overtime_pay DECIMAL(12, 2) NOT NULL DEFAULT 0,
  gross_salary DECIMAL(12, 2) NOT NULL DEFAULT 0,
  deductions DECIMAL(12, 2) NOT NULL DEFAULT 0,
  net_salary DECIMAL(12, 2) NOT NULL DEFAULT 0,
  payment_status ENUM('draft', 'approved', 'paid') NOT NULL DEFAULT 'draft',
  paid_at DATETIME NULL,
  slip_url VARCHAR(500) NULL,
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME NULL,
  calculated_at DATETIME NULL,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payroll_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payroll_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_payroll_user_month (user_id, payroll_month)
);

CREATE TABLE IF NOT EXISTS overtime_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  work_date DATE NOT NULL,
  hours DECIMAL(6, 2) NOT NULL,
  rate_multiplier DECIMAL(4, 2) NOT NULL DEFAULT 1.50,
  note VARCHAR(500) NULL,
  status ENUM('approved', 'rejected') NOT NULL DEFAULT 'approved',
  recorded_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_overtime_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_overtime_recorder FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_overtime_user_date (user_id, work_date),
  INDEX idx_overtime_date (work_date)
);
