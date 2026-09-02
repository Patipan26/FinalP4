SET NAMES utf8mb4;

USE carcare_db;

ALTER TABLE users ADD COLUMN wage_type ENUM('hourly', 'daily', 'monthly') NOT NULL DEFAULT 'hourly';
ALTER TABLE users ADD COLUMN wage_rate DECIMAL(12, 2) NOT NULL DEFAULT 50.00;
UPDATE users SET wage_type = 'hourly', wage_rate = 50.00 WHERE wage_type IS NULL OR wage_rate IS NULL OR wage_rate <= 0;

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

ALTER TABLE payrolls MODIFY payment_status ENUM('pending', 'draft', 'approved', 'paid') NOT NULL DEFAULT 'draft';
UPDATE payrolls SET payment_status = 'draft' WHERE payment_status = 'pending';
ALTER TABLE payrolls MODIFY payment_status ENUM('draft', 'approved', 'paid') NOT NULL DEFAULT 'draft';
ALTER TABLE payrolls ADD COLUMN wage_type ENUM('hourly', 'daily', 'monthly') NOT NULL DEFAULT 'hourly';
ALTER TABLE payrolls ADD COLUMN wage_rate DECIMAL(12, 2) NOT NULL DEFAULT 50.00;
ALTER TABLE payrolls ADD COLUMN regular_hours DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE payrolls ADD COLUMN regular_days DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE payrolls ADD COLUMN leave_days DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE payrolls ADD COLUMN overtime_hours DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE payrolls ADD COLUMN overtime_rate DECIMAL(10, 2) NOT NULL DEFAULT 1.50;
ALTER TABLE payrolls ADD COLUMN regular_pay DECIMAL(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE payrolls ADD COLUMN overtime_pay DECIMAL(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE payrolls ADD COLUMN gross_salary DECIMAL(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE payrolls ADD COLUMN deductions DECIMAL(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE payrolls ADD COLUMN approved_by BIGINT UNSIGNED NULL;
ALTER TABLE payrolls ADD COLUMN approved_at DATETIME NULL;
ALTER TABLE payrolls ADD COLUMN calculated_at DATETIME NULL;
ALTER TABLE payrolls ADD COLUMN notes VARCHAR(500) NULL;

ALTER TABLE payrolls ADD CONSTRAINT fk_payroll_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
