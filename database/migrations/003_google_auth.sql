SET NAMES utf8mb4;

USE carcare_db;

ALTER TABLE users MODIFY password_hash VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN google_subject VARCHAR(255) NULL UNIQUE;
